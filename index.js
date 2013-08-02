var express = require('./express-ws');

var requirejs = require('requirejs');
requirejs.config({
	nodeRequire: require
});
requirejs(['./web/utils','./web/simulator','./web/wsball-game','./web/jsonwebsocketmessenger','./web/network-server'],function(utils,Simulator,game,JsonWebsocketMessenger,NetworkServer) {
//require('sugar');

var app = express();

app.use(express.static('web'));

var rooms = {};

function createRoom(name) {
	var simulator = new Simulator(game);
	var networkServer = new NetworkServer(simulator);
	networkServer.messageHandlers['up'] = handleKeyMsg;
	networkServer.messageHandlers['down'] = handleKeyMsg;
	networkServer.messageHandlers['setname'] = handleSetname;
	var room = {
		simulator: simulator,
		networkServer: networkServer
	};
	rooms[name] = room;
	return room;
}

function getRoom(name) {
	return rooms[name];
}

function createClientInRoom(ws,room) {
	var networkServer = room.networkServer;
	var messenger = new JsonWebsocketMessenger(ws);
	var client = networkServer.createClient(messenger);

	networkServer.clients.forEach(function(other) {
		if (other === client) { return; }
		if (!other.name) { return; }
		client.messenger.send({
			type: 'setname',
			clientid: other.id,
			name: other.name
		});
	});

	return client;
}

function handleKeyMsg(msg) {
	var simulator = this.server.simulator;
	simulator.insertEvent(msg.frame,{
		type: msg.type,
		clientid: this.id,
		key: msg.key
	});
	if (msg.frame < simulator.timeframes[simulator.timeframes.length-1].gamestate.frame) {
		msg.frame = simulator.timeframes[simulator.timeframes.length-1].gamestate.frame;
		sendReset();
	}
	this.broadcast({
		type: msg.type,
		clientid: this.id,
		key: msg.key,
		frame: msg.frame
	});
}

function handleSetname(msg) {
	if (/^[a-zA-Z0-9_\-\.]{1,5}$/.test(msg.name)) {
		this.name = msg.name;
		this.sendToOthers({
			type: msg.type,
			clientid: this.id,
			name: msg.name
		});
	} else {
		this.messenger.send({
			type:'setname',
			clientid:this.id,
			name:this.name
		});
	}
}

app.ws.usepath('/rooms/hallo',function(req,next) {
	var roomName = 'hallo';
	var room = getRoom(roomName) || createRoom(roomName);

	if (!utils.contains(req.requestedProtocols,'game')) { console.log('Rejected'); return req.reject(); }
	console.log('connected');
	var ws = req.accept('game',req.origin);

	createClientInRoom(ws,room);
});


app.listen(8085);

function update() {
	var tf = simulator.getLastTimeFrame();
	process.stdout.write('\r' + [
		'@'+tf.gamestate.frame,
		'!'+simulator.futureEvents.length,
		'|'+simulator.timeframes.length,
		':'+tf.gamestate.players.length,
		'*'+tf.events.length,
		tf.gamestate.players.map(function(player) {
			return '('+Math.round(player.x)+','+Math.round(player.y)+')';
		}).join(' ')
		].join(' '));
	updateGame();

	// Trim timeframes that will never be used (the oldest timeframe in use by clients)
	var minimalframe = clients.reduce(function(prev,client) {
		return client.lastframe < prev ? client.lastframe : prev;
	},simulator.getLastFrame());
	while (simulator.timeframes.length > 0 && simulator.timeframes[simulator.timeframes.length-1].gamestate.frame < minimalframe) {
		simulator.timeframes.pop();
	}
	/*var curframe = getLastTimeFrame().gamestate.frame;
	clients.forEach(function(client) {
		if (curframe - client.lastsyn < 30) { return; }
		client.lastsyn = curframe;
		client.messenger.send({
			type: 'syn',
			frame: curframe
		});
	});*/
}

// setInterval(update,1000*(1/30));


process.on('uncaughtException', function (err) {
	console.dir(err,'--',err.stack);
	throw err;
});

});