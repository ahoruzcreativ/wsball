define(['platform','game','vector','staticcollidable','linesegment','editor','required','state','level','mouse','collision','keyboard','quake','resources'],function(platform,Game,Vector,StaticCollidable,LineSegment,editor,required,state,level,mouse,collision,keyboard,quake,resources) {
	var t = new Vector(0,0);
	var t2 = new Vector(0,0);
	var rs = {
		'images': ['test','mouse','moneybag','car','safe_open','safe_closed','player_head','player_body','player_dead','player_body_strangle','player_body_drag','player_shoe','floor','wall100','wall200','wall300','wall600'],
		'audio': []
	};

	var g,game;
	platform.once('load',function() {
		var canvas = document.getElementById('main');
		game = g = new Game(startGame, canvas, [required(['chrome']),mouse,keyboard,resources(rs),state,level,collision,quake]);
		g.resources.status.on('changed',function() {
			g.graphics.context.clearRect(0,0,800,600);
			g.graphics.context.fillStyle = 'black';
			g.graphics.context.font = 'arial';
			g.graphics.fillCenteredText('Preloading ' + g.resources.status.ready + '/' + g.resources.status.total + '...',400,300);
		});
	});

	function startGame(err) {
	if (err) { console.error(err); }
	var images = g.resources.images;
	var audio = g.resources.audio;

	g.objects.lists.particle = g.objects.createIndexList('particle');
	g.objects.lists.spring = g.objects.createIndexList('spring');
	g.objects.lists.start = g.objects.createIndexList('start');
	g.objects.lists.finish = g.objects.createIndexList('finish');
	g.objects.lists.enemy = g.objects.createIndexList('enemy');
	g.objects.lists.usable = g.objects.createIndexList('usable');
	g.objects.lists.collectable = g.objects.createIndexList('collectable');
	g.objects.lists.shadow = g.objects.createIndexList('shadow');

	// Auto-refresh
	(function() {
		var timeout = setTimeout(function() {
			document.location.reload(true);
		}, 3000);
		g.once('keydown',function() {
			disable();
		});
		g.once('mousemove',function() {
			disable();
		});
		g.chains.draw.push(draw);
		function draw(g,next) {
			g.fillStyle('#ff0000');
			g.fillCircle(800,0,30);
			g.fillStyle('black');
			next(g);
		}
		function disable() {
			clearTimeout(timeout);
			g.chains.draw.remove(draw);
		}
	})();

	function consolelog(/*...*/) {
		console.log.apply(console,arguments);
	}

	function connectingState() {
		var me = {
			enabled: false,
			enable: enable,
			disable: disable
		};
		function enable() {
			var ws = new WebSocket('ws://localhost:8085/client', 'game');
			ws.onopen = function() {
				game.changeState(gameplayState(ws));
			};
		}
		function disable() {

		}
		function draw(g,next) {
			g.fillCircle(100,100,50);
			next(g);
		}
		return me;
	}

	function gameplayState(ws) {
		var me = {
			enabled: false,
			enable: enable,
			disable: disable
		};

		var game = newGame();
		var timeframes = game.timeframes;
		var getLastTimeFrame = game.getLastTimeFrame;
		var updateGame = game.updateGame;
		var resetTimeFrame = game.resetTimeFrame;
		var clientid = undefined;
		var gameinterval = undefined;

		function getPlayer() {
			return getLastTimeFrame().gamestate.players.filter(function(player) {
				return player.clientid === clientid
			})[0];
		}

		function update() {
			updateGame();
		}

		ws.onmessage = function(event) {
			var msg = JSON.parse(event.data);
			console.log(msg);
			({
				initialize: function(msg) {
					clientid = msg.clientid;
					timeframes.splice(0,timeframes.length,msg.timeframe);
					gameinterval = setInterval(update,1000*(1/30));
				},
				reset: function(msg) {
					resetTimeFrame(msg.timeframe);
					console.log('RESET to ',msg.timeframe.gamestate.frame);
					clearInterval(gameinterval);
					gameinterval = setInterval(update,1000*(1/30)+1);
				},
				connect: function(msg) {
					game.insertEvent(msg.frame,{
						type: 'connect',
						clientid: msg.clientid
					});
				},
				disconnect: function(msg) {
					game.insertEvent(msg.frame,{
						type: 'disconnect',
						clientid: msg.clientid
					});
				},
				up: function(msg) {
					game.insertEvent(msg.frame,{
						type: 'up',
						clientid: msg.clientid,
						key: msg.key
					});
				},
				down: function(msg) {
					game.insertEvent(msg.frame,{
						type: 'down',
						clientid: msg.clientid,
						key: msg.key
					});
				}
			}[msg.type] || consolelog)(msg);
		};

		function keyEvent(event) {
			var timeframe = getLastTimeFrame();
			timeframe.events.push(Object.merge({
				clientid: clientid
			},event));
			ws.send(JSON.stringify(Object.merge({
				frame: timeframe.gamestate.frame
			},event)));
		}

		function enable() {
			g.chains.draw.push(draw);
			g.on('mousedown',mousedown);
			g.on('keydown',keydown);
			g.on('keyup',keyup);
		}
		function disable() {
			g.chains.draw.remove(draw);
			g.removeListener('mousedown',mousedown);
			g.removeListener('keydown',keydown);
			g.removeListener('keyup',keyup);
		}

		function draw(g,next) {
			var player = getPlayer();
			if (!player) { return; }

			// Draw HUD
			g.fillStyle('white');
			g.fillText('Frame: '+getLastTimeFrame().gamestate.frame,100,100);

			getLastTimeFrame().gamestate.players.forEach(function(player) {
				var x = player.x;
				var y = 600-player.y;
				g.fillStyle('blue');
				g.fillCircle(x,y,30);
				g.fillStyle('white');
				g.fillText('Player:'+player.x+','+player.y,x,y);
			});
			next(g);
		}
		function keydown(key) {
			keyEvent({
				type: 'down',
				key: key
			});
		}
		function keyup(key) {
			keyEvent({
				type: 'up',
				key: key
			});
		}
		function mousedown(button) {
		}
		return me;
	}

	g.changeState(connectingState());

	g.start();
	}
});
