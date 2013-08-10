define(['./utils'],function(utils) {
	/** @constructor */
	function Simulator(game) {
		this.futureEvents = [];
		this.timeframes = [{
			events: [],
			gamestate: game.init()
		}];
		this.game = game;
	}
	(function(p) {
		p.getTimeFrame = function(frame) {
			var frameIndex = this.timeframes[0].gamestate.frame - frame;
			utils.assert(frameIndex >= 0, 'The frame '+frame+' was newer than the last frame '+this.timeframes[0].gamestate.frame);
			utils.assert(frameIndex < this.timeframes.length, 'The frame '+frame+' was too old! (max '+this.timeframes.length+')');
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

				addSorted(this.timeframes[0].events,futureEvent.event,this.game.compareEvents);
			}

			// Remove old timeframes
			while (this.timeframes.length > 50) {
				this.timeframes.pop();
			}
		};
		p.pushEvent = function(event) {
			this.insertEvent(this.getCurrentFrame(),event);
		};
		p.insertEvent = function(frame,event) {
			utils.assert(event);
			var frameIndex = this.getLastTimeFrame().gamestate.frame - frame;
			if (frameIndex < 0) { // Event in the future?
				var index = utils.findIndex(this.futureEvents, function(futureEvent) {
					return frame < futureEvent.frame;
				});
				if (index === -1) { index = this.futureEvents.length; }
				this.futureEvents.splice(index,0,{
					frame: frame,
					event: event
				});
			} else if (frameIndex < this.timeframes.length) { // Event of current frame or the past?
				var timeframe = this.getTimeFrame(frame);
				addSorted(timeframe.events,event,this.game.compareEvents);
				this.recalculateGameStates(frame);
			} else {
				throw new Error('The inserted frame is prehistoric: it is too old to simulate');
			}
		};
		p.resetToTimeFrames = function(newTimeframes,newFutureEvents) {
			console.log('!RESET to',newTimeframes[0].gamestate.frame,'with',newTimeframes.length,'timeframes and',newFutureEvents.length,'future events');

			// Reset timeframes
			this.timeframes.length = 0;
			for(var i=0;i<newTimeframes.length;i++) {
				this.timeframes.push(newTimeframes[i]);
			}

			// Reset futureEvents
			this.futureEvents.length = 0;
			for(var i=0;i<newFutureEvents.length;i++) {
				this.futureEvents.push(newFutureEvents[i]);
			}

			if (this.timeframes.length > 1) {
				utils.assert(this.timeframes[0].gamestate.frame === (this.timeframes[1].gamestate.frame+1));
			}
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
		p.getLastTimeFrame = function() {
			return this.timeframes[0];
		};
		p.getLastFrame = function() {
			return this.getLastTimeFrame().gamestate.frame;
		};
		function addSorted(arr,item,compare) {
			var i;
			for(i=0;i<arr.length && compare(item,arr[i])>0;i++) { }
			arr.splice(i,0,item);
		}
	})(Simulator.prototype);

	return Simulator;
});