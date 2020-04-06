var $ = function(id){return document.getElementById(id)};

// Object Tracking
var existingObjects = [];
var newObjects = [];
var textObject;

//Operation Variables
var stage = "waiting";
var mode = "drawing";

var playerId = 0;
var playerName = 'Dylan';
var gameName = 'DylanBowman';


var canvasElement = $("gameCanvas");
canvasElement.width  = window.innerWidth;
canvasElement.height = window.innerHeight-100;


//Server code
var socket = io();
socket.on('message', function(data) {
  console.log(data);
});

//Get Socket/Player ID From Server.
socket.emit('new player');

socket.on('socketId', function(data) {
   playerId = data;
   console.log(playerId); 

   //TODO: Make it so you can actually choose a game to join.
   socket.emit('join game', {
        gameName: gameName,
        player : {
            id:playerId,
            name:playerName
        }
   });
});

socket.on('newMove', function(data) {
    console.log(data);
    if (data.nextPlayer == playerId) {
        stage = "playing";       
    } else {
        stage = "waiting";
    }
    updateButtonStates();
    updateOperation();

    //Load the lines into place.
    fabric.util.enlivenObjects(data.objects, function(objects) {
        var origRenderOnAddRemove = canvas.renderOnAddRemove;
        canvas.renderOnAddRemove = false;
    
        objects.forEach(function(o) {
            canvas.add(o);
        });
        canvas.renderOnAddRemove = origRenderOnAddRemove;
        canvas.renderAll();
    });
    
    // canvas.add(data.text);
});

socket.on('catch up', function(data) {
    //Load the lines into place.
    fabric.util.enlivenObjects(data, function(objects) {
        var origRenderOnAddRemove = canvas.renderOnAddRemove;
        canvas.renderOnAddRemove = false;
    
        objects.forEach(function(o) {
            canvas.add(o);
        });
        canvas.renderOnAddRemove = origRenderOnAddRemove;
        canvas.renderAll();
    });
    
    // canvas.add(data.text);
});


//Create the canvas for play.
var canvas = this.__canvas = new fabric.Canvas('gameCanvas', {
    isDrawingMode : true,
    selection : false
});



if (canvas.freeDrawingBrush) {
    canvas.freeDrawingBrush.color = '#ff0000';
    canvas.freeDrawingBrush.width = 5;
}



canvas.on("path:created", function(o) {
    //Disable the new path from moving.
    lockObject(o.path, true);
    newObjects.push(o.path);
    console.log(o.path);
})


$("exportToSvg").onclick = function(event) {
    console.log("SVG:");
    console.log(canvas.toSVG());
}

$("stageButton").onclick = function(event) {
    if (stage === "waiting") {
        stage = "playing";
    }

    updateOperation();
}



$("lockButton").onclick = function(event) {

}

var createText = function(left,top) {
    textObject = new fabric.IText('Your Rule Here', {
        fontFamily: 'arial black',
        left:left-150,
        top:top-50
    });
    return textObject;
}

var updateButtonStates = function() {
    if (stage === 'waiting') {
        $("modeDraw").disabled = true;
        $("modeText").disabled = true;
    } else {
        $("modeDraw").disabled = false;
        $("modeText").disabled = false;
    }
}

var updateOperation = function() {
    console.log(stage + " " + mode);
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
        console.log(zoom);


        var vpt = this.viewportTransform;
        if (zoom < 400 / 1000) {
            this.viewportTransform[4] = 200 - 1000 * zoom / 2;
            this.viewportTransform[5] = 200 - 1000 * zoom / 2;
        } else {
            if (vpt[4] >= 0) {
                this.viewportTransform[4] = 0;
            } else if (vpt[4] < canvas.getWidth() - 1000 * zoom) {
                this.viewportTransform[4] = canvas.getWidth() - 1000 * zoom;
            }
            if (vpt[5] >= 0) {
                this.viewportTransform[5] = 0;
            } else if (vpt[5] < canvas.getHeight() - 1000 * zoom) {
                this.viewportTransform[5] = canvas.getHeight() - 1000 * zoom;
            }
        }
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

//Set the mode variable and update functionality appropriately.
var setMode = function(selectedMode) {
    mode = selectedMode;

    //Set defaults. 
    canvas.isDrawingMode = false;

    if (textObject) {
        lockObject(textObject, true);
    }

    $("modeDraw").classList.remove("active");
    $("modeText").classList.remove("active");
    $("modeMove").classList.remove("active");
    //Modify based on what mode is selected.
    if (selectedMode === "drawing") {
        canvas.isDrawingMode = true;
        $("modeDraw").classList.add("active");
    } else if (selectedMode === "typing") {
        if (!textObject) {
            var center = getCenter(newObjects);
            canvas.add(createText(center[0], center[1]));
        }

        lockObject(textObject, false);
        $("modeText").classList.add("active");
    } else if (selectedMode === "moving") {
        console.log("Moving Mode");
        $("modeMove").classList.add("active");
    }
}

$("modeDraw").onclick = function(event) {setMode("drawing")}
$("modeText").onclick = function(event) {setMode("typing")}
$("modeMove").onclick = function(event) {setMode("moving")}

var finishTurn = function() {
    var output = {
        name : gameName,
        playerId : playerId,
        playerName : playerName,
        objects : newObjects.concat([textObject])
        
    }
    console.log(JSON.stringify(output));

    existingObjects.concat(newObjects);
    lockObject(textObject,true);
    existingObjects.push(textObject);
    newObjects = [];
    textObject = null;

    //Send data to server?
    socket.emit('moveFinished', output);
    stage = 'waiting';
    setMode("moving");

    updateButtonStates();
}


$("finishTurn").onclick = finishTurn;

var lockObject = function(targetObject, lock) {
    targetObject.lockMovementX = lock;
    targetObject.lockMovementY = lock;
    targetObject.lockScalingX = lock;
    targetObject.lockScalingY = lock;
    targetObject.hasControls = !lock;
}

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
        playerId : playerId
    });
    console.log("Bye");
}





//Last minute loads.
updateOperation();