// Dependencies
var express = require('express');
var http = require('http');
var path = require('path');
var socketIO = require('socket.io');

var app = express();
var server = http.Server(app);
var io = socketIO(server);

app.set('port', 80);
app.use('/static', express.static(__dirname + '/static'));

// Routing
app.get('/', function(request, response) {
    response.sendFile(path.join(__dirname, 'static/index.html'));
});


// Starts the server.
server.listen(80, function() {
    console.log('Starting server on port 80');
});

// Add the WebSocket handlers
io.on('connection', function(socket) {
});

games = {};

var newGame = function(name, firstPlayer, socket) {
    return {
        name: name,
        players: [firstPlayer],
        sockets: [socket],
        data: [],
        activePlayer : firstPlayer.id
    }
}

io.on('connection', function(socket) {
    socket.on('new player', function() {
        console.log("New Player, Socket "+socket.id);
        socket.emit('socketId', socket.id)
    });

    socket.on('join game', function(data) {
        if (!(data.gameName in games)) {
            //If the player enters a name of a game that isn't currently in progress, create a new one.
            games[data.gameName] = newGame(data.gameName, data.player, socket);
        } else {
            var game = games[data.gameName];
            //Add the player to the list of players.
            game.players.push(data.player);
            game.sockets.push(socket);
            //Send the socket the latest game information.
            socket.emit('catch up', game.data);
            log(game, 'Catching up '+data.player.id);
        }
    })

    socket.on('moveFinished', function(data) {

        var game = games[data.name];
        log(game, "Move Finished.");
        //Set next player to play.
        for (var i = 0; i < game.players.length; ++i) {
            if (game.activePlayer == game.players[i].id) {
                //Use the modulus operator to decide whos turn it is next.
                var nextIndex = (i+1) % (game.players.length);
                game.activePlayer = game.players[nextIndex].id;
                break;
            }
        }

        //Send the data out to everyone.
        for (var sock of game.sockets) {            
            data.nextPlayer = game.activePlayer;
            sock.emit('newMove', data);
            game.data = game.data.concat(data.objects)
        }
    });

    socket.on('leavingGame', function(data){
        var game = games[data.name];
        
        if (game) {
            log(game, "User Leaving: "+data.playerId);
            var index = 0;
            for (var i = 0; i < game.players.length; ++i) {
                if (game.players[i].id === data.playerId) {
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
    })
});

function log(game, text) {
    console.log("Game '" + game.name + "': "+text);
}