define([],function() {
	function NetworkClient(messenger,simulator) {
		this.messenger = messenger;
		this.simulator = simulator;
		this.messageHandlers = {
			initialize: handleInitialize.bind(this),
			reset: handleReset.bind(this),
			ack: handleAck.bind(this)
		};
		this.messenger.onmessage = handleMessage.bind(this);
		this.status = NetworkClient.STATUS_INITIALIZING;
		console.log('NetworkClient');

		this.defaultgamerate = 1000*(1/30);
		this.latencySolving = 0;
	}

	function handleMessage(msg) {
		console.log('handleMessage',msg);
		if (msg.frame && this.simulator.isFramePrehistoric(msg.frame)) {
			this.status = NetworkClient.STATUS_RESETTING;
			this.messenger.send({
				type: 'resetrequest'
			});
			return;
		}

		(this.messageHandlers[msg.type] || consolelog)(msg);
	}

	// General message handlers.
	function handleInitialize(msg) {
		console.log('handleInitialize');
		this.clientid = msg.clientid;

		// Replace all timeframes with the one we received.
		this.simulator.timeframes.splice(0,this.simulator.length,msg.timeframe);

		this.status = NetworkClient.STATUS_ACTIVE;

		update.call(this);

		this.syninterval = setInterval(synchronizeTime.bind(this),1000);
	}
	function handleReset(msg) {
		this.status = NetworkClient.STATUS_ACTIVE;
		this.simulator.resetToTimeFrames(msg.timeframes);
		console.log('RESET to ',msg.timeframes[0].gamestate.frame);
		clearTimeout(this.gameupdateTimeout);
		this.update();
	}
	function toMs(frames) {
		return frames*(1000/30);
	}
	function handleAck(msg) {
		var now = this.simulator.getLastTimeFrame().gamestate.frame;
		var roundtripFrames = now - msg.oframe;
		var clientFrames = msg.oframe + roundtripFrames*0.5;
		var framesDifference = clientFrames - msg.nframe;

		// How fast do we want to get to server's time
		this.latencySolvingFrames = 30;

		var newLatencySolving = toMs(framesDifference)/this.latencySolvingFrames;
		this.latencySolving = this.latencySolving*0.5+newLatencySolving*0.5;
		this.latencyMs = toMs(now-msg.oframe);
	}

	function update() {
		if (this.latencySolvingFrames > 0) {
			this.latencySolvingFrames--;
			if (this.latencySolvingFrames === 0) {
				this.latencySolving = 0;
			}
		}
		this.gameupdateTimeout = setTimeout(update.bind(this),this.defaultgamerate+this.latencySolving);
		this.simulator.updateGame();
	}
	function synchronizeTime() {
		this.messenger.send({
			type: 'syn',
			frame: this.simulator.getLastTimeFrame().gamestate.frame
		});
	}
	(function(p) {
		p.STATUS_ACTIVE = 0;
		p.STATUS_INITIALIZING = 1;
		p.STATUS_RESETTING = 2;

		p.update = update;
	})(NetworkClient.prototype);
	return NetworkClient;
});