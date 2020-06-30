// Dependencies
var express = require('express');
var http = require('http');
var path = require('path');
var socketIO = require('socket.io');
const port = process.env.PORT || 3000;

var app = express();
var server = http.Server(app);
var io = socketIO(server);

app.set('port', port);
app.use('/static', express.static(__dirname + '/static'));

// Routing
app.get('*', function(request, response) {
    response.sendFile(path.join(__dirname, 'static/','index.html'));
});


// Starts the server.
server.listen(port, function() {
    console.log('Starting server on port 80');
});

// Add the WebSocket handlers
io.on('connection', function(socket) {
});

games = {};
lastPings = {};
pingTimes = {};
pingTimeouts = {};
pingIntervals = {};

var newGame = function(name, firstPlayer, socket) {
    return {
        name: name,
        players: [firstPlayer],
        sockets: [socket],
        data: [],
        activePlayer : firstPlayer.id,
        ops : [firstPlayer.id]
    }
}

var startNextTurn = function(game) {
    var nextPlayerName;
    
    for (var i = 0; i < game.players.length; ++i) {
        if (game.activePlayer == game.players[i].id) {
            //Use the modulus operator to decide whos turn it is next.
            var nextIndex = (i+1) % (game.players.length);
            game.activePlayer = game.players[nextIndex].id;
            nextPlayerName = game.players[nextIndex].name;
            break;
        }
    }
    
    //Send the data out to everyone.
    var chatData = {
        type : "turn",
        message : nextPlayerName + ", your turn!"
    };

    var output = [];

    for (var player of game.players) {
        output.push({
            name:player.name,
            id:player.id,
            color:player.color,
            activePlayer:game.activePlayer ===player.id,
        });
    }
    
    for (var sock of game.sockets) {    
        sock.emit('message-down', chatData);
        sock.emit('responsePlayers', output);
    }


    
    return nextPlayerName;
    
}

var getPlayer = function(playerId) {
    for (var gameName in games) {
        var game = games[gameName];
    
        for (var player of game.players) {
            if (player.id == playerId) {
                return player;
            }
        }
    }

    return undefined;
}

var opPlayer = function(game, playerId) {
    log(game, "Opping player "+playerId);
    game.ops.push(playerId);
}

var kickPlayer = function(game, player) {
    log(game, "User Leaving: "+player.id);
    
    //Send data to the players.
    var chatData = {
        type : "turn",
        message : player.name + " has left the game."
    };
    
    for (var sock of game.sockets) {    
        sock.emit('message-down', chatData);
    }
    
    if (game.activePlayer === player.id) {
        log(game, 'Active player left. Skipping.');
        var nextPlayerName = startNextTurn(game);
        
        var data = {
            gameName : game.name
            
        }
        
        for (var sock of game.sockets) {            
            data.nextPlayer = game.activePlayer;
            sock.emit('newMove', data);
        }
    }

    if (game.ops.includes(player.id)) {
        var index = game.ops.indexOf(player.id);
        game.ops.splice(index,1);

        if (game.ops.length == 0 && game.players.length > 1) {
            //Set the first person post-kick as the op.
            opPlayer(game, game.players[1].id);
        }
    }
    
    clearInterval(pingIntervals[player.id]);
    
    
    
    
    var index = 0;
    for (var i = 0; i < game.players.length; ++i) {
        if (game.players[i].id === player.id) {
            index = i;
            break;
        }
    }
    
    game.players.splice(index,1);
    game.sockets.splice(index,1);
    
    if (game.players.length == 0) {
        //All players have left the game, clear it out.
        log(game, "Last Player has left. Deleting game.");
        delete games[game.name];
    }
}

var sendPlayers = function(socket, data) {
    var game = games[data.gameName];

    var output = [];

    for (var player of game.players) {
        output.push({
            name:player.name,
            id:player.id,
            color:player.color,
            activePlayer:game.activePlayer ===player.id,
            op:game.ops.includes(player.id)
        });
    }

    socket.emit('responsePlayers', output);
}

io.on('connection', function(socket) {
    
    
    
    
    
    socket.on('disconnect', function() {
        //The player disconnected. Clear out some sockets and shenanigans.
        for (gameName in games) {
            var game = games[gameName];
            for (player of game.players) {
                if (player.id == socket.Id) {
                    //This is the player. Kick 'em.
                    kickPlayer(game, player);
                    break;
                }
            }
        }
    })
    
    socket.on('new player', function() {
        console.log("New Player, Socket "+socket.id);
        socket.emit('socketId', socket.id);
        
        
        
    });
    
    socket.on('join game', function(data) {
        var game;

        if (!(data.gameName in games)) {
            //If the player enters a name of a game that isn't currently in progress, create a new one.
            game = newGame(data.gameName, data.player, socket);
            games[data.gameName] = game;
            socket.emit('firstMove');
            log(game, 'Created Game.');
            log(game, 'Player Joined: '+socket.id);
        } else {
            game = games[data.gameName];
            //Add the player to the list of players.
            game.players.push(data.player);
            game.sockets.push(socket);
            //Send the socket the latest game information.
            socket.emit('catch up', game.data);
            log(game, 'Catching up '+data.player.id);
        }
        
        //Send data to the players.
        var chatData = {
            type : "turn",
            message : data.player.name + " has joined the game!"
        };
        
        for (var sock of game.sockets) {    
            sock.emit('message-down', chatData);
        }
    })
    
    socket.on('moveFinished', function(data) {
        
        var game = games[data.name];
        log(game, "Move Finished.");
        var nextPlayerName = startNextTurn(game);
        
        for (var sock of game.sockets) {            
            data.nextPlayer = game.activePlayer;
            sock.emit('newMove', data);
            game.data = game.data.concat(data.objects)
        }
    });
    
    socket.on('markerThrow', function(data) {
        var game = games[data.gameName];
        for (var sock of game.sockets) {
            sock.emit('markerThrow', data);
        }
    });
    
    //Understand a message as it comes in from the user.
    socket.on('message-up', function(data) {
        var game = games[data.gameName];

        //Log the sender's info.
        var playerObj = getPlayer(socket.id);

        if (playerObj) {
            log(game, "[CHAT] " + playerObj.name + ": "+data.message);
        } else {
            log(game, "Couldn't find player at " + socket.id);
        }
        
        //If it starts with a / then it is a command.
        if (data.message.startsWith('/')) {
            var command = data.message.split(' ');
            
            if (command[0] === '/skip') {

                if (!(game.ops.includes(socket.id))) {
                    socket.emit('message-down', {
                        type:"turn",
                        message:"You don't have permission to use that command."
                    });

                    return;
                }
                //if the command is "skip", then skip the current player.
                
                log(game, "Skipping.");
                var nextPlayerName = startNextTurn(game);
                //Set next player to play.
                
                
                
                var data = {
                    gameName : data.gameName
                    
                }
                
                for (var sock of game.sockets) {            
                    data.nextPlayer = game.activePlayer;
                    sock.emit('newMove', data);
                }
                
            } else {
                socket.emit('message-down', {
                    type:"turn",
                    message:"No such command: "+command[0]
                });
            }
            return;
        }
        data.type="chat";
        for(var sock of game.sockets) {
            sock.emit("message-down", data);
        }
    });

    socket.on('opPlayer', function(data) {
        
        
        var game = games[data.gameName];
        opPlayer(game, data.playerId);

        

        sendPlayers(socket, data);
    });

    socket.on('kickPlayer', function(data) {

        var game = games[data.gameName];

        for (var i in game.players) {
            if (game.players[i].id == data.playerId) {
                kickPlayer(game, game.players[i]);
            }
        }
        
        sendPlayers(socket, data);
    });

    socket.on('requestPlayers', function(data) {
        sendPlayers(socket, data);
    });
    
    socket.on('leavingGame', function(data){
        var game = games[data.name];
        
        if (game) {
            kickPlayer(game, {name:data.playerName,id:data.playerId});            
        }
    });
});

function log(game, text) {
    console.log("Game '" + game.name + "': "+text);
}