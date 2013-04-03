define(['platform','game','vector','staticcollidable','linesegment','editor','required','state','level','mouse','collision','keyboard','quake','resources','wsball-game'],function(platform,Game,Vector,StaticCollidable,LineSegment,editor,required,state,level,mouse,collision,keyboard,quake,resources,newGame) {
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
			var loc = window.location, new_uri;
			if (loc.protocol === 'https:') {
				new_uri = 'wss:';
			} else {
				new_uri = 'ws:';
			}
			new_uri += '//' + loc.host;
			new_uri += '/client';

			var ws = new WebSocket(new_uri, 'game');
			ws.onopen = function() {
				game.changeState(gameplayState(ws));
			};
			ws.onclose = function() {
				window.location.reload();
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
		var clientid = undefined;

		var gameupdateTimeout = undefined;
		var defaultgamerate = 1000*(1/30);
		var gamerate = defaultgamerate;
		
		var latencyMs = 0;
		var latencySolving = 0;
		var latencySolvingFrames = 0;

		var syninterval = undefined;

		var requestingReset = false;

		function getPlayer() {
			return getLastTimeFrame().gamestate.players.filter(function(player) {
				return player.clientid === clientid
			})[0];
		}

		function update() {
			if (latencySolvingFrames > 0) {
				latencySolvingFrames--;
				if (latencySolvingFrames === 0) {
					latencySolving = 0;
				}
			}
			gameupdateTimeout = setTimeout(update,defaultgamerate+latencySolving);
			updateGame();
		}

		var simulateLatency = false;
		var simulateLatencyBase = 100;
		var simulateLatencyUnstability = 50;
		var simulateLatencySpikeAmount = 500;
		var simulateLatencySpikeOccurance = 0.01;

		function latency() {
			return simulateLatencyBase
				+  (Math.random()*simulateLatencyUnstability-simulateLatencyUnstability*0.5)
				+  (Math.random() < simulateLatencySpikeOccurance ? simulateLatencySpikeAmount : 0);
		}

		function latencySimulator(cb) {
			var timeout = null;
			var queue = [];

			function push(/*...*/) {
				if (!simulateLatency) {
					return cb.apply(null,arguments);
				}
				queue.push({
					trigger: Date.now() + latency(),
					args: arguments
				});
				waitForDequeue();
			}

			function waitForDequeue() {
				if (queue.length > 0 && !timeout) {
					timeout = setTimeout(dequeue,queue[0].trigger - Date.now());
				}
			}

			function dequeue() {
				var now = Date.now();
				while (queue.length > 0 && queue[0].trigger <= now) {
					cb.apply(null,queue.shift().args);
				}
				timeout = null;
				waitForDequeue();
			}

			return push;
		}

		var send = latencySimulator(function(msg) {
			ws.send(JSON.stringify(msg));
		});

		ws.onmessage = latencySimulator(function(event) {
			var msg = JSON.parse(event.data);
			console.log(msg);

			if (msg.frame && game.isFramePrehistoric(msg.frame)) {
				requestingReset = true;
				send({
					type: 'resetrequest'
				});
				return;
			}

			({
				initialize: function(msg) {
					clientid = msg.clientid;
					timeframes.splice(0,timeframes.length,msg.timeframe);
					update();

					syninterval = setInterval(synchronizeTime,1000);
				},
				reset: function(msg) {
					requestingReset = false;
					game.resetToTimeFrames(msg.timeframes);
					console.log('RESET to ',msg.timeframes[0].gamestate.frame);
					clearTimeout(gameupdateTimeout);
					update();
				},
				ack: function(msg) {
					function toMs(frames) {
						return frames*(1000/30);
					}
					var now = getLastTimeFrame().gamestate.frame;
					var roundtripFrames = now - msg.oframe;
					var clientFrames = msg.oframe + roundtripFrames*0.5;
					var framesDifference = clientFrames - msg.nframe;

					// How fast do we want to get to server's time
					latencySolvingFrames = 30;

					var newLatencySolving = toMs(framesDifference)/latencySolvingFrames;
					latencySolving = latencySolving*0.5+newLatencySolving*0.5;
					latencyMs = toMs(now-msg.oframe);
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
		});

		function synchronizeTime() {
			send({
				type: 'syn',
				frame: getLastTimeFrame().gamestate.frame
			});
		}

		function keyEvent(event) {
			var timeframe = getLastTimeFrame();
			timeframe.events.push(Object.merge({
				clientid: clientid
			},event));
			send(Object.merge({
				frame: timeframe.gamestate.frame
			},event));
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

			function round(f) {
				return Math.round(f*100)/100;
			}

			for(var i=1-1;i>=0;i--) {
				var timeframe = timeframes[i];
				g.context.globalAlpha = 1-(i/timeframes.length);
				timeframe.gamestate.players.forEach(function(player) {
					var x = player.x;
					var y = 600-player.y;
					g.fillStyle('blue');
					g.fillCircle(x,y,20);
					g.fillStyle('white');
					g.fillText('Player:'+round(player.x)+','+round(player.y),x,y);
				});

				g.fillStyle('white');
				g.fillCircle(timeframe.gamestate.ball.x,600-timeframe.gamestate.ball.y,10);
			}


			// Draw HUD
			g.fillStyle('white');
			g.fillText('Frame:  '+getLastTimeFrame().gamestate.frame,100,100);
			g.fillText('latencySolving: '+round(latencySolving),100,110);
			g.fillText('Latency: '+round(latencyMs),100,120);

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
