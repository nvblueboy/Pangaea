// Object Tracking
var existingObjects = [];
var newObjects = [];
var operations = [];
var textObject;
var previousTextObject;
var markerObject;
var editingTextObject = false;
var playerList = [];

//Operation Variables
var stage = "waiting";
var mode = "moving";

var playerId = 0;
var playerName;
var gameName;
var color; 


//Debug variables
var debug=false;
var debugRect;



function setCanvasSize() {
    //Lay out the canvas.
    var canvasElement = $("#gameCanvas").get(0);
    canvasElement.width  = window.innerWidth-300;
    canvasElement.height = window.innerHeight;
}

//Set the initial amount
setCanvasSize();

$("#chat-tab").tab("show");


/////////////////////////////////////////
//
//      Modal/Entry Code
//
/////////////////////////////////////////


var getUrlVars = function() {
    var vars = {};
    var parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
        vars[key] = value;
    });
    return vars;
}

$("#modalSubmit").click(function() {
    var form = $("#entryForm");
    if (form.get(0).checkValidity() === true) {
        //Get data from the form.
        gameName = $("#gameNameInput").val();
        playerName = $("#playerNameInput").val();
        color = $("#colorInput").val();
        
        //Join the game (emitting to the server)
        joinGame(gameName, playerName);
        
        if (canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush.color = color;
            canvas.freeDrawingBrush.width = 5;
        }
        
        //Hide the modal to start the user in the
        $("#myModal").modal('hide');
    } else {
        form.addClass("was-validated");
    }
});



/////////////////////////////////////////
//
//      Server Code
//
/////////////////////////////////////////
var socket = io();

//Get Socket/Player ID From Server.
socket.emit('new player');

var joinGame = function(gameToJoin, newPlayerName) {
    gameName = gameToJoin;
    playerName = newPlayerName;
    socket.emit('join game', {
        gameName: gameName,
        player : {
            id:playerId,
            name:playerName,
            color:color
        }
    });
    
    //Set the input for sharing to the correct place.
    $("#shareText").val("http://"+window.location.hostname+'/?gameName='+gameName);
}

socket.on('newMove', function(data) {
    if (data.nextPlayer == playerId) {
        stage = "playing";

        var text = 'It is your turn in Pizza Box!';
        if (document.hidden) {
            var notification = new Notification('Your Turn', { body: text }); 
        }
        playSound('./static/ding.mp3');  
        
    } else {
        stage = "waiting";
    }
    updateButtonStates();
    updateOperation();
    
    //Load the lines into place.
    if (data.playerId != playerId) {
        fabric.util.enlivenObjects(data.objects, function(objects) {
            var origRenderOnAddRemove = canvas.renderOnAddRemove;
            canvas.renderOnAddRemove = false;
            
            objects.forEach(function(o) {
                lockObject(o, true);
                existingObjects.push(o);
                canvas.add(o);
            });
            canvas.renderOnAddRemove = origRenderOnAddRemove;
            canvas.renderAll();
        });
    }
    
    $("#throwMarker").show();
    
    
    // canvas.add(data.text);
});

socket.on('catch up', function(data) {
    //Load the lines into place.
    stage = "waiting";
    
    updateButtonStates();
    updateOperation();
    fabric.util.enlivenObjects(data, function(objects) {
        var origRenderOnAddRemove = canvas.renderOnAddRemove;
        canvas.renderOnAddRemove = false;
        
        objects.forEach(function(o) {
            lockObject(o, true);
            existingObjects.push(o);
            canvas.add(o);
        });
        canvas.renderOnAddRemove = origRenderOnAddRemove;
        canvas.renderAll();
    });
    
    // canvas.add(data.text);
});

socket.on('firstMove', function() {
    stage="playing";
    $("#throwMarker").show();
    updateButtonStates();
    updateOperation();
});

socket.on('markerThrow', function(data) {
    setMarker(data.x, data.y);
})


/////////////////////////////////////////
//
//      Notification Code
//
/////////////////////////////////////////
function checkNotificationPromise() {
    try {
        Notification.requestPermission().then();
    } catch(e) {
        return false;
    }
    
    return true;
}

function askNotificationPermission() {
    // function to actually ask the permissions
    function handlePermission(permission) {
        // Whatever the user answers, we make sure Chrome stores the information
        if(!('permission' in Notification)) {
            Notification.permission = permission;
        }
        
    }
    
    // Let's check if the browser supports notifications
    if (!('Notification' in window)) {
        console.log("This browser does not support notifications.");
    } else {
        if(checkNotificationPromise()) {
            Notification.requestPermission()
            .then((permission) => {
                handlePermission(permission);
            })
        } else {
            Notification.requestPermission(function(permission) {
                handlePermission(permission);
            });
        }
    }
}
askNotificationPermission();
/////////////////////////////////////////
//
//      Chat Code
//
/////////////////////////////////////////

document.addEventListener('keypress', function(evt) {
    if (evt.code === 'Enter' && document.activeElement.id === 'chatInput' && !editingTextObject) {
        sendMessage();
    }


    //Ctrl+Z = Undo
    if (event.ctrlKey && event.keyCode == 26 && !editingTextObject) {
        event.stopPropagation();
        event.preventDefault();
        undo();
    }

    //Ctrl+= = Zoom In
    if (event.keyCode == 61) {
        if (document.activeElement.id != 'chatInput' && !editingTextObject) {
            zoomDelta(.1);
            event.stopPropagation();
            event.preventDefault();
        }
    }

    //Ctrl+- = Zoom In
    if (event.keyCode == 45) {
        if (document.activeElement.id != 'chatInput' && !editingTextObject) {
            zoomDelta(-.1);
            event.stopPropagation();
            event.preventDefault();
        }
    }

    //D = Draw Mode
    if (event.keyCode==100) {
        if (document.activeElement.id != 'chatInput' && stage=="playing" && !editingTextObject) {
            setMode("drawing");
            event.stopPropagation();
            event.preventDefault();
        }
    }

    //T = Text Mode
    if (event.keyCode==116) {
        if (document.activeElement.id != 'chatInput' && stage=="playing" && !editingTextObject) {
            setMode("typing");
            event.stopPropagation();
            event.preventDefault();
        }
    }

    //M = Move Mode
    if (event.keyCode==109) {
        if (document.activeElement.id != 'chatInput' && stage=="playing" && !editingTextObject) {
            setMode("moving");
            event.stopPropagation();
            event.preventDefault();
        }
    }

    //Space = throw marker
    if (event.keyCode==32) {
        if (document.activeElement.id != 'chatInput' && $("#throwMarker").is(":visible") && !editingTextObject) {
            throwMarker();
            event.stopPropagation();
            event.preventDefault();
        }
    }

});

function sendMessage() {
    var value = $("#chatInput").val();
    var objectToSend = {
        gameName: gameName,
        playerName: playerName,
        message: value,
        color:color
    };
    
    if (value != '' && value != null) {
        socket.emit('message-up', objectToSend);
        $("#chatInput").val('');
    }
}

socket.on('message-down', function(data) {
    var newElement = createElement(data);
    $("#chatContainer").append(newElement);

    var objDiv = document.getElementById('chatContainer');
    objDiv.scrollTop = objDiv.scrollHeight;
});

var createElement = function(data) {
    if (data.type === "chat") {
        var top = document.createElement('div');
        top.classList.add('chatMessage');
        top.classList.add('chatWindowRow');
        
        var sender = document.createElement('div');
        sender.classList.add('chatMessageSender');

        var colorBox = document.createElement('div');
        colorBox.classList.add('chatMessageColorBox');
        colorBox.style = 'background-color:'+data.color;
        sender.append(colorBox);
        sender.append(document.createTextNode(data.playerName))
        top.append(sender);
        
        var message = document.createElement('div');
        message.classList.add('chatMessageContent');
        message.append(document.createTextNode(data.message));
        top.append(message);
        
        return top;
    }
    if (data.type === "turn") {
        var top = document.createElement('div');
        top.classList.add('chatMessage');
        top.classList.add('chatWindowRow');
        
        var sender = document.createElement('div');
        sender.classList.add('chatMessageSender');
        sender.append(document.createTextNode(data.message))
        top.append(sender);
        
        return top;
    }
}

/////////////////////////////////////////
//
//      Player List Code
//
/////////////////////////////////////////


var getPlayerList = function() {
    socket.emit('requestPlayers', {gameName : gameName});
}

$("#players-tab").on("show.bs.tab", getPlayerList);

socket.on('responsePlayers', function(data) {
    playerList = data;

    $("#players").empty();

    playerIsOp = false;
    
    for(var i = 0; i < data.length; ++i) {
        if (data[i].id == playerId && data[i].op) {
            playerIsOp = true;
        }
    }

    for (var i = 0; i < data.length; ++i) {
        var elem = createPlayerElement(data[i]);
        $("#players").append(elem);

        $(".opPlayerButton").click(function(event) {
            if (!confirm("Are you sure you want to op this player?")) {
                return;
            }
            socket.emit('opPlayer', {
                gameName: gameName,
                playerId: event.target.id
            });
        });

        $(".kickPlayerButton").click(function(event) {
            if (!confirm("Are you sure you want to kick this player?")) {
                return;
            }
            socket.emit('kickPlayer', {
                gameName: gameName,
                playerId: event.target.id
            });
        });
    }
});

var playerIsOp = false;

function createPlayerElement(player) {
    var top = document.createElement('div');
    top.classList.add('chatMessage');
    top.classList.add('chatWindowRow');
    top.classList.add('playerListRow');
    if (player.activePlayer) {
        top.classList.add('activePlayer');
    }


    if (player.op) {
        top.classList.add('isOp');
    }

    var sender = document.createElement('div');
    sender.classList.add('chatMessageSender');

    var colorBox = document.createElement('div');
    colorBox.classList.add('chatMessageColorBox');
    colorBox.style = 'background-color:'+player.color;
    sender.append(colorBox);
    sender.append(document.createTextNode(player.name))
    top.append(sender);

    if (playerIsOp) {
        var opMenuContainer = document.createElement("div");
        opMenuContainer.classList.add("dropleft");
        var opMenu = document.createElement('button');
        opMenu.classList.add('opMenu');
        opMenu.classList.add('fas');
        opMenu.classList.add('fa-ellipsis-v');
        // opMenu.classList.add('dropdown-toggle');
        opMenu.setAttribute('data-toggle','dropdown');
        opMenu.id = player.id;
        opMenuContainer.append(opMenu);
        opMenuContainer.append(createBootstrapMenu(player));
        top.append(opMenuContainer);
    }

    return top;
}

function createBootstrapMenu(player) {
    var container = document.createElement("div");
    container.classList.add("dropdown-menu");

    var opButton = document.createElement("a");
    opButton.classList.add("opPlayerButton");
    opButton.classList.add('dropdown-item');
    opButton.id = player.id;
    opButton.append(document.createTextNode('Op Player'));
    container.append(opButton);

    var kickButton = document.createElement("a");
    kickButton.classList.add("kickPlayerButton");
    kickButton.classList.add('dropdown-item');
    kickButton.id = player.id;
    kickButton.append(document.createTextNode('Kick Player'));
    container.append(kickButton);

    return container;

}




/////////////////////////////////////////
//
//      Audio Code
//
/////////////////////////////////////////

function playSound(filename){
    let src = './static/ding.mp3';
    let audio = new Audio(src);
    audio.play();
  }

/////////////////////////////////////////
//
//      Game Code
//
/////////////////////////////////////////
//Create the canvas for play.
var canvas = this.__canvas = new fabric.Canvas('gameCanvas', {
    isDrawingMode : true,
    selection : false
});

$(window).resize(function(){
    
    var w = $(window).width() - 300;
    var h = $(window).height();
    var center = {x:w / 2, y:h / 2};
    
    canvas.setDimensions({width:w,height:h});
    // canvas.forEachObject(function(obj){
        
    //     obj.set({
    //         left : center.x + obj.offsetLeft,
    //         top : center.y + + obj.offsetTop,
    //     });
        
    //     obj.setCoords();
        
    // });
    
    // need to call calcOffset whenever the canvas resizes
    canvas.calcOffset();
    canvas.renderAll();
    
});


canvas.on("path:created", function(o) {
    //Disable the new path from moving.
    lockObject(o.path, true);
    newObjects.push(o.path);
    operations.push("draw");
})


var createText = function(left,top) {
    textObject = new fabric.IText(prompt("What is your rule?"), {
        fontFamily: 'arial black',
        left:left-150,
        top:top-50,
        fill: color,
        textAlign:'center'
    });
    previousTextObject = JSON.parse(JSON.stringify(textObject));
    return textObject;
}

var updateButtonStates = function() {
    if (stage === 'waiting') {
        $("#playingControls").hide();
        $("#waitingMessage").show();
        $("#modeDraw").disabled = true;
        $("#modeText").disabled = true;
    } else {
        $("#playingControls").show();
        $("#waitingMessage").hide();
        $("#modeDraw").disabled = false;
        $("#modeText").disabled = false;
    }

    $('[data-toggle="tooltip"]').tooltip();
}

var updateOperation = function() {
    if (stage === "waiting") {
        canvas.isDrawingMode = false;
        setMode("moving");
    } else if (stage === "playing") {
        setMode(mode);
    }
}

canvas.on("mouse:down", function(opt) {
    var evt = opt.e;
    if (mode === 'moving') {
        canvas.isDragging = true;
        canvas.lastPosX = evt.clientX;
        canvas.lastPosY = evt.clientY;
    }
});

canvas.on("mouse:up", function(opt) {
    if (mode === 'moving') {
        canvas.isDragging = false;
    }
});

$("#zoomIn").click(function(evt) {
    zoomDelta(.1);
});

$("#zoomOut").click(function(evt) {
    zoomDelta(-.1);
});

var zoomDelta = function(delta) {
    var zoom = canvas.getZoom();
    zoom = zoom + delta;
    if (zoom > 1) zoom = 1;
    if (zoom < 0.2) zoom = 0.2;
    canvas.setZoom(zoom);
    console.log(zoom);
}

canvas.on('mouse:wheel', function(opt) {
    if (mode === "moving") {
        var delta = opt.e.deltaY;
        var zoom = canvas.getZoom();
        zoom = zoom - delta/1000;
        if (zoom > 1) zoom = 1;
        if (zoom < 0.2) zoom = 0.2;
        canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
        opt.e.preventDefault();
        opt.e.stopPropagation();
        
        
        // var vpt = this.viewportTransform;
        // if (zoom < 400 / 1000) {
        //     this.viewportTransform[4] = 200 - 1000 * zoom / 2;
        //     this.viewportTransform[5] = 200 - 1000 * zoom / 2;
        // } else {
        //     if (vpt[4] >= 0) {
        //         this.viewportTransform[4] = 0;
        //     } else if (vpt[4] < canvas.getWidth() - 1000 * zoom) {
        //         this.viewportTransform[4] = canvas.getWidth() - 1000 * zoom;
        //     }
        //     if (vpt[5] >= 0) {
        //         this.viewportTransform[5] = 0;
        //     } else if (vpt[5] < canvas.getHeight() - 1000 * zoom) {
        //         this.viewportTransform[5] = canvas.getHeight() - 1000 * zoom;
        //     }
        // }
    }
});


canvas.on('mouse:move', function(opt) {
    if (canvas.isDragging) {
        var e = opt.e;
        canvas.viewportTransform[4] += e.clientX - canvas.lastPosX;
        canvas.viewportTransform[5] += e.clientY - canvas.lastPosY;

        canvas.renderAll();
        canvas.lastPosX = e.clientX;
        canvas.lastPosY = e.clientY;
    }
});

canvas.on("text:editing:entered", function(evt){
    editingTextObject = true;    
});

canvas.on("text:editing:exited", function(evt){
    editingTextObject = false;
});

var moveCanvas = function(x,y) {
    // console.log("Moving Canvas to "+x+","+y);
    // console.log(canvas.getZoom());
    // canvas.isDragging = true;
    // canvas.viewportTransform[4] = (x) * canvas.getZoom() + 200;
    // canvas.viewportTransform[5] = (y) * canvas.getZoom() + 200;
    // canvas.renderAll();
    // canvas.lastPosX = x;
    // canvas.lastPosY = y;
    // canvas.isDragging = false;
}

//Set the mode variable and update functionality appropriately.
var setMode = function(selectedMode) {
    mode = selectedMode;
    
    //Set defaults. 
    canvas.isDrawingMode = false;
    
    if (textObject) {
        lockObject(textObject, true);
    }
    
    $("#modeDraw").removeClass("active");
    $("#modeText").removeClass("active");
    $("#modeMove").removeClass("active");
    //Modify based on what mode is selected.
    if (selectedMode === "drawing") {
        canvas.isDrawingMode = true;
        $("#modeDraw").addClass("active");
    } else if (selectedMode === "typing") {
        if (!textObject) {
            var center = getCenter(newObjects);
            canvas.add(createText(center[0], center[1]));
            operations.push("text");
        }
        
        lockObject(textObject, false);
        canvas.setActiveObject(textObject);
        $("#modeText").addClass("active");
    } else if (selectedMode === "moving") {
        $("#modeMove").addClass("active");
    }
}

var throwMarker = function(event) {
    $("#throwMarker").hide();
    var minX;
    var maxX;
    var minY;
    var maxY;

    console.group("ThrowMarker Algorithm");
    
    //If there are objects, use the first one. If not, set a basic min+max.
    if (existingObjects.length >= 1) {
        minX = existingObjects[0].left;
        minY = existingObjects[0].top;
        maxX = existingObjects[0].left +  existingObjects[0].width;
        maxY = existingObjects[0].top +  existingObjects[0].height;
    } else {
        minX = 0;
        minY = 0;
        maxX = 100;
        maxY = 100;
    }
    for (var i = 0; i < existingObjects.length; ++i) {
        console.log("Object: ");
        console.log(existingObjects[i]);
        //Find the bounds of all existing objects.
        var existing = existingObjects[i];
        var coords = existingObjects[i].oCoords;
        if (existing.left < minX) {
            minX = existing.left;
        }
        
        if (existing.top < minY) {
            minY = existing.top;
        }
        
        if (existing.left + existing.width > maxX) {
            maxX = existing.left + existing.width;
        }
        
        if (existing.top + existing.height > maxY) {
            maxY = existing.top + existing.height;
        }
        
    }

    console.group("Min and Max Pre-Stripe");
    console.log("MinX: "+minX);
    console.log("MinY: "+minY);
    console.log("MaxX: "+maxX);
    console.log("MaxY: "+maxY);
    console.groupEnd();
    
    var stripe = 200; //A stripe of space around the board that playing could be allowed.
    minX = minX - stripe;
    minY = minY - stripe;
    maxX = maxX + stripe;
    maxY = maxY + stripe;

    console.group("Min and Max Post-Stripe");
    console.log("MinX: "+minX);
    console.log("MinY: "+minY);
    console.log("MaxX: "+maxX);
    console.log("MaxY: "+maxY);
    console.groupEnd();

    if (debug) {
        if (debugRect) {
            //Get rid of the old one
            canvas.remove(debugRect);
        }

        debugRect = new fabric.Rect({
            left: minX,
            top: minY,
            fill: 'rgba(0,0,0,0)',
            strokeWidth:5,
            stroke: 'rgba(127,127,127,.5)',
            width: maxX-minX,
            height: maxY-minY
        });

        canvas.add(debugRect);
    }
    
    var randomX = (Math.random() * (maxX - minX)) + minX;
    var randomY = (Math.random() * (maxY - minY)) + minY;
    
    setMarker(randomX, randomY);
    
    socket.emit('markerThrow', {
        gameName: gameName,
        x: randomX,
        y: randomY
    });

    moveCanvas(randomX, randomY);

    console.groupEnd();
    
    
    
}

$("#throwMarker").click(throwMarker)

var setMarker = function(x, y) {
    if (markerObject != null && !debug) {
        canvas.remove(markerObject);
    }
    
    markerObject = new fabric.Circle({
        top : y - 10,
        left : x - 10,
        radius: 20,
        fill: "#FF1A13",
        stroke: 'rgba(0,0,0,1)',
        strokeWidth: 5
    });

    lockObject(markerObject, true);
    
    
    
    canvas.add(markerObject);
}

$("#modeDraw").click(function(event) {setMode("drawing")});
$("#modeText").click(function(event) {setMode("typing")});
$("#modeMove").click(function(event) {setMode("moving")});

var finishTurn = function() {
    var output = {
        name : gameName,
        playerId : playerId,
        playerName : playerName,
        
        
    }
    
    if (newObjects.length > 0 && textObject != null) {
        existingObjects = existingObjects.concat(newObjects);
        lockObject(textObject,true);
        existingObjects.push(textObject);
        output.objects = newObjects.concat([textObject]);
        newObjects = [];
        textObject = null;
    } else if (newObjects.length > 0) {
        alert("You cannot finish your turn without a rule if you have drawn.");
        return;
    } else if (textObject != null) {
        alert("You have to draw a shape around your rule.");
        return;
    }
    
    
    //Send data to server?
    socket.emit('moveFinished', output);
    stage = 'waiting';
    setMode("moving");
    
    updateButtonStates();
}


$("#finishTurn").click(finishTurn);

var lockObject = function(targetObject, lock) {
    targetObject.lockMovementX = lock;
    targetObject.lockMovementY = lock;
    targetObject.lockScalingX = lock;
    targetObject.lockScalingY = lock;
    targetObject.hasControls = !lock;
    targetObject.hasBorders = !lock;
}

canvas.on("object:modified", function(evt) {
    if (evt.target === textObject && !undoUnderway) {
        
        operations.push(JSON.parse(JSON.stringify(previousTextObject)));
        
        previousTextObject = JSON.parse(JSON.stringify(textObject));
        
    }
})

var undoUnderway = false;
var undo = function() {
    undoUnderway = true;
    if (operations.length > 0) {
        var op = operations.pop();

        if (op === "draw") {
            var toRemove = newObjects.pop();
            canvas.remove(toRemove);
        } else if (op === "text") {
            canvas.remove(textObject);
            textObject = null;
        } else if (op.type === "i-text") {
            //The text got moved. Undo that operation.
            textObject.set('left', op.left);
            textObject.set('top', op.top);
            textObject.set('scaleX', op.scaleX);
            textObject.set('scaleY', op.scaleY);
            textObject.set('angle', op.angle);
            textObject.set('text', op.text);
            textObject.setCoords();
            canvas.renderAll();
            previousTextObject = JSON.parse(JSON.stringify(textObject));
            
        }
    }
    undoUnderway = false;
}

$("#undoButton").click(undo);

var getCenter = function(pathList) {
    if (pathList.length === 0) {
        return [100, 100];
    }
    
    //Count up the X and Y values of the center of the path.
    var xCumulative = 0;
    var yCumulative = 0;
    
    for (var i = 0; i < pathList.length; ++i) {
        xCumulative += pathList[i].left;
        yCumulative += pathList[i].top;
    }
    
    return [xCumulative/pathList.length, yCumulative/pathList.length];
}

window.onbeforeunload = function() {
    socket.emit('leavingGame', {
        name: gameName,
        playerId : playerId,
        playerName : playerName
    });
}

$("#copyLinkButton").click(function(evt) {
    var copyText = document.getElementById("shareText");
    
    /* Select the text field */
    copyText.select();
    copyText.setSelectionRange(0, 99999); /*For mobile devices*/
    
    /* Copy the text inside the text field */
    document.execCommand("copy");
});

$("#downloadButton").click(function(evt) {
    const dataURL = canvas.toDataURL({
        width: canvas.width,
        height: canvas.height,
        left: 0,
        top: 0,
        format: 'png',
   });
   const link = document.createElement('a');
   link.download = 'image.png';
   link.href = dataURL;
   document.body.appendChild(link);
   link.click();
   document.body.removeChild(link);
})



socket.on('socketId', function(data) {
    playerId = data;
    
    //Process the URL vars.
    var urlVars = getUrlVars();
    
    if ('gameName' in urlVars) {
        gameName = urlVars.gameName;
        $("#gameNameInput").val(urlVars.gameName);
    }
    
    if ('playerName' in urlVars) {
        playerName = urlVars.playerName;
        $("#playerNameInput").val(urlVars.playerName);
    }
    
    if ('color' in urlVars) {
        color = urlVars.color;
        $("#colorInput").val(urlVars.color);
    }
    
    if ('gameName' in urlVars && 'playerName' in urlVars && 'color' in urlVars) {
        //If all 3 are in, just join the game and get moving.
        //Join the game (emitting to the server)
        joinGame(gameName, playerName);
        
        if (canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush.color = color;
            canvas.freeDrawingBrush.width = 5;
        }
    } else {
        //If a value is missing, display the modal.
        $('#myModal').modal({
            backdrop:'static',
            keyboard: false,
            show:true
        });
    }
    
    //Last minute loads.
    updateOperation();
});

