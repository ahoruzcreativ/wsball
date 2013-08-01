define(['platform','game','vector','staticcollidable','linesegment','editor','required','state','level','mouse','collision','keyboard','quake','resources',
		'simulator','wsball-game','jsonwebsocketmessenger'
	],function(platform,Game,Vector,StaticCollidable,LineSegment,editor,required,state,level,mouse,collision,keyboard,quake,resources,
		Simulator,game,JsonWebsocketMessenger
	) {
	var t = new Vector(0,0);
	var t2 = new Vector(0,0);
	var rs = {
		'images': ['test','mouse','moneybag','car','safe_open','safe_closed','player_head','player_body','player_dead','player_body_strangle','player_body_drag','player_shoe','floor','wall100','wall200','wall300','wall600'],
		'audio': []
	};

	var g;
	platform.once('load',function() {
		var canvas = document.getElementById('main');
		g = new Game(startGame, canvas, [required(['chrome']),mouse,keyboard,resources(rs),state,level,collision,quake]);
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

	function safeRefresh() {
		if (!safeRefresh.disconnectMessage) {
			var disconnectMessage = safeRefresh.disconnectMessage = document.createElement('div');
			disconnectMessage.appendChild(document.createTextNode('Disconnected'));
			document.body.appendChild(disconnectMessage);
		}

		function pollConnection() {
			var r = new XMLHttpRequest();
			r.open("GET", "/", true);
			r.onreadystatechange = function () {
				if (r.readyState != 4 || r.status != 200) {
					setTimeout(pollConnection,1000);
				} else {
					window.location.reload(true);
				}
			};
			r.send();
		}
		pollConnection();
	}

	// Auto-refresh
	(function() {
		var timeout = setTimeout(function() {
			safeRefresh();
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
				g.changeState(gameplayState(ws));
			};
			ws.onclose = function() {
				safeRefresh();
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
		var messenger = new JsonWebsocketMessenger(ws);
		var simulator = new Simulator(game);
		var timeframes = simulator.timeframes;
		var getLastTimeFrame = simulator.getLastTimeFrame.bind(simulator);
		var updateGame = simulator.updateGame.bind(simulator);
		var clientid = undefined;

		var gameupdateTimeout = undefined;
		var defaultgamerate = 1000*(1/30);
		var gamerate = defaultgamerate;
		
		var latencyMs = 0;
		var latencySolving = 0;
		var latencySolvingFrames = 0;

		var syninterval = undefined;

		var requestingReset = false;
		var playernames = {};
		var playernameInput = document.createElement('input');
		playernameInput.onchange = function() { setName(playernameInput.value); };
		document.body.appendChild(playernameInput);

		function setName(name) {
			playernames[clientid] = name;
			send({
				type: 'setname',
				name: name
			});
		}

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

		var send = function(msg) {
			messenger.send(msg);
		};

		messenger.onmessage = function(msg) {
			console.log(msg);

			if (msg.frame && simulator.isFramePrehistoric(msg.frame)) {
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
					simulator.resetToTimeFrames(msg.timeframes);
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
				setname: function(msg) {
					playernames[msg.clientid] = msg.name;
				},
				connect: function(msg) {
					simulator.insertEvent(msg.frame,{
						type: 'connect',
						clientid: msg.clientid
					});
				},
				disconnect: function(msg) {
					simulator.insertEvent(msg.frame,{
						type: 'disconnect',
						clientid: msg.clientid
					});
				},
				up: function(msg) {
					simulator.insertEvent(msg.frame,{
						type: 'up',
						clientid: msg.clientid,
						key: msg.key
					});
				},
				down: function(msg) {
					simulator.insertEvent(msg.frame,{
						type: 'down',
						clientid: msg.clientid,
						key: msg.key
					});
				}
			}[msg.type] || consolelog)(msg);
		};

		function synchronizeTime() {
			send({
				type: 'syn',
				frame: getLastTimeFrame().gamestate.frame
			});
		}

		function keyEvent(event) {
			var timeframe = getLastTimeFrame();
			simulator.pushEvent(Object.merge({
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

			var white = '#eeeeee';

			function round(f) {
				return Math.round(f*100)/100;
			}

			g.fillStyle('#19ab1c');
			g.fillRectangle(0,0,800,600);

			// Draw alternating colors
			(function() {
				var width = 50;
				g.fillStyle('rgba(255,255,255,0.05)');
				for(var i=0;i<10;i++) {
					var dir = (i%2 === 0 ? 1 : -1);
					var x = dir * i * width + 400;
					g.fillRectangle(x,0,width*dir,600);
				}
			})();

			// Draw lines
			(function() {
				var level = game.level;
				var ctx = g.context;
				g.strokeStyle('rgba(255,255,255,0.5)');
				g.lineWidth(5);
				ctx.beginPath();
				ctx.moveTo(level.ballcollision[0].start.x,level.ballcollision[0].start.y);
				level.ballcollision.forEach(function(line) {

					// HACK: Do not draw collision of goals
					if (line.start.x <= 10 || line.end.x <= 10) { return; }
					if (line.start.x >= 790 || line.end.x >= 790) { return; }


					ctx.lineTo(line.end.x,line.end.y);
				});
				ctx.closePath();
				ctx.stroke();
				g.lineWidth(1);
			})();

			g.context.save();
			drawGoalShadow();
			g.context.translate(400,300);
			g.context.scale(-1,1);
			g.context.translate(-400,-300);
			drawGoalShadow();
			g.context.restore();

			function drawShadow(x,y,r,shadowWidth) {
				var gradient = g.context.createRadialGradient(x,y,r,x,y,r+shadowWidth);
				gradient.addColorStop(0,'rgba(0,0,0,0.4)');
				gradient.addColorStop(1,'transparent');
				g.fillStyle(gradient);
				g.fillCircle(x,y,r+shadowWidth);
			}

			var drawHistory = Math.min(1,timeframes.length);
			for(var i=drawHistory-1;i>=0;i--) {
				var timeframe = timeframes[i];
				g.context.globalAlpha = 1-(i/drawHistory);

				var ball = timeframe.gamestate.ball;

				// Draw player shadows
				timeframe.gamestate.players.forEach(function(player) {
					drawShadow(player.x,player.y,game.constants.player_radius,5);
				});

				drawShadow(ball.x,ball.y,game.constants.ball_radius,3);

				// Draw player bodies
				timeframe.gamestate.players.forEach(function(player) {
					var x = player.x;
					var y = player.y;

					g.fillStyle(game.level.teams[player.team].color);
					g.fillCircle(x,y,game.constants.player_radius);

					g.strokeStyle(player.keys.x
						? white
						: 'rgba(0,0,0,0.2)');
					var playerBorderWidth = 6;
					g.lineWidth(playerBorderWidth);
					g.strokeCircle(x,y,game.constants.player_radius - playerBorderWidth*0.5);
					g.lineWidth(1);

					var playername = playernames[player.clientid];
					if (playername) {
						g.fillStyle(white);
						g.fillCenteredText(playername,x,y);
					}
					//g.fillText('Player:'+round(player.x)+','+round(player.y),x,y);
				});

				// Draw ball
				(function() {
					g.fillStyle(white);
					g.fillCircle(ball.x,ball.y,game.constants.ball_radius);
				})();
			}

			// Draw goal
			function pathGoal() {
				var ctx = g.context;
				var top = 240-5;
				var bot = 360+5;
				var front = 50-2;
				var back = 10;
				ctx.beginPath();
				ctx.moveTo(front  ,top);
				var radius = 20;
				ctx.lineTo(back+radius,top);
				ctx.quadraticCurveTo(back,top,back,top+radius);

				ctx.lineTo(back   ,bot-radius);
				ctx.quadraticCurveTo(back,bot,back+radius,bot);
				ctx.lineTo(front  ,bot);
			}
			function drawGoalShadow() {
				var ctx = g.context;
				pathGoal();

				g.strokeStyle('black');
				g.lineWidth(10);
				ctx.shadowBlur=10;
				ctx.shadowColor='black';
				ctx.lineCap = 'round';
				ctx.stroke();
				ctx.lineCap = 'butt';
				ctx.shadowBlur=0;
			}
			function drawGoal(color) {
				var ctx = g.context;
				pathGoal();

				g.strokeStyle(color);
				g.lineWidth(10);
				ctx.lineCap = 'round';
				ctx.stroke();

				g.strokeStyle('rgba(0,0,0,0.15)');
				ctx.stroke();

				ctx.lineCap = 'butt';
			}
			g.context.save();
			drawGoal(game.level.teams[0].color);
			g.context.translate(400,300);
			g.context.scale(-1,1);
			g.context.translate(-400,-300);
			drawGoal(game.level.teams[1].color);
			g.context.restore();

			drawBigText(getLastTimeFrame().gamestate.scores[0].toString(), white, 300,42);
			drawBigText('-', white, 400,42);
			drawBigText(getLastTimeFrame().gamestate.scores[1].toString(), white, 500,42);

			function drawBigText(text,color,x,y) {
				g.context.font = 'bold 42pt arial';
				g.fillStyle('#111');
				g.fillCenteredText(text, x+3,y+3);
				g.fillStyle(color);
				g.context.shadowBlur=10;
				g.context.shadowColor='#111';
				g.fillCenteredText(text, x,y);
				g.context.font = '12px arial';
				g.context.shadowBlur=0;
			}

			// Draw HUD
			g.fillStyle('white');
			g.fillText('Frame:  '+getLastTimeFrame().gamestate.frame,100,100);
			g.fillText('latencySolving: '+round(latencySolving),100,110);
			g.fillText('Latency: '+round(latencyMs),100,120);
			g.fillText('Scores: '+getLastTimeFrame().gamestate.scores[0] + ' - ' + getLastTimeFrame().gamestate.scores[1],100,130);

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
