define([],function() {
	function assert(b) { if(!b) {
		debugger;
		throw new Error('Assertion failed');
	} }

	function findIndex(arr,f) {
		for(var i=0;i<arr.length;i++) {
			if (f(arr[i],i)) { return i; }
		}
		return -1;
	}

	function Simulator(game) {
		this.futureEvents = [];
		this.timeframes = [{
			events: [],
			gamestate: game.init()
		}];
		this.game = game;
	}
	(function(p) {
		p.getLastTimeFrame = function() {
			return this.timeframes[0];
		};
		p.getTimeFrame = function(frame) {
			var frameIndex = this.timeframes[0].gamestate.frame - frame;
			assert(frameIndex >= 0, 'The frame '+frame+' was newer than the last frame '+this.timeframes[0].gamestate.frame);
			assert(frameIndex < this.timeframes.length, 'The frame '+frame+' was too old! (max '+this.timeframes.length+')');
			return this.timeframes[frameIndex];
		};
		p.recalculateGameStates = function(fromframe) {
			var now = this.timeframes[0].gamestate.frame;
			for(var frame=fromframe;frame<now;frame++) {
				var timeframe = this.getTimeFrame(frame);
				var newGameState = this.nextGameStateFromTimeFrame(timeframe);
				this.getTimeFrame(frame+1).gamestate = newGameState;
			}
		};
		p.nextGameStateFromTimeFrame = function(timeframe) {
			return this.game.update(timeframe.gamestate, timeframe.events);
		};
		p.updateGame = function() {
			// Calculate new timeframe
			var curtimeframe = this.timeframes[0];
			var curgamestate = curtimeframe.gamestate;
			var curevents = curtimeframe.events;
			var newgamestate = this.game.update(curgamestate,curevents);
			this.timeframes.unshift({
				events: [],
				gamestate: newgamestate
			});

			// Place (previously) future events in the new timeframe if they were destined to be in that frame.
			while (this.futureEvents.length > 0 && newgamestate.frame === this.futureEvents[0].frame) {
				var futureEvent = this.futureEvents.shift();
				this.timeframes[0].events.push(futureEvent.event);
			}

			// Remove old timeframes
			while (this.timeframes.length > 15) {
				this.timeframes.pop();
			}
		};
		p.insertEvent = function(frame,event) {
			var frameIndex = this.getLastTimeFrame().gamestate.frame - frame;
			if (frameIndex < 0) { // Event in the future?
				var index = findIndex(this.futureEvents, function(futureEvent) {
					return frame < futureEvent.frame;
				});
				if (index === -1) { index = this.futureEvents.length; }
				this.futureEvents.splice(index,0,{
					frame: frame,
					event: event
				});
			} else if (frameIndex < this.timeframes.length) { // Event of current frame or the past?
				var timeframe = this.getTimeFrame(frame);
				timeframe.events.push(event);
				this.recalculateGameStates(frame);
			} else {
				throw new Error('The inserted frame is prehistoric: it is too old to simulate');
			}
		};
		p.resetToTimeFrames = function(newTimeframes) {
			this.timeframes.length = 0;
			Array.prototype.push.apply(this.timeframes,newTimeframes);
			assert(this.timeframes[0].gamestate.frame === (this.timeframes[1].gamestate.frame+1));
		};
		p.isFramePrehistoric = function(frame) {
			return frame < this.timeframes[this.timeframes.length-1].gamestate.frame;
		};
		p.getCurrentGameState = function() {
			return this.timeframes[0].gamestate;
		};
		p.getCurrentFrame = function() {
			return this.timeframes[0].gamestate.frame;
		};
	})(Simulator.prototype);

	return Simulator;
});