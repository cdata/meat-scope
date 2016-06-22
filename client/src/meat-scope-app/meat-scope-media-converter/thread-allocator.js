(function(self) {
  'use strict';

  function MeatScopeThreadAllocator(ports) {
    this.size = ports.length;
    this.threads = ports;
    this.freeThreads = ports.slice();
    this.waitQueue = [];

    this.threads.forEach(function(thread) {
      thread.addEventListener('error', this.onThreadError.bind(this))
      thread.start();
    }, this);
  }

  MeatScopeThreadAllocator.prototype = {
    freeThread: function(thread) {
      thread.postMessage({
        type: 'meat-scope-reset'
      });

      if (this.waitQueue.length) {
        this.waitQueue.shift()(thread);
      } else {
        this.freeThreads.push(thread);
      }
    },

    awaitThread: function() {
      if (this.freeThreads.length) {
        return Promise.resolve(this.freeThreads.pop())
      }

      return new Promise(function(resolve) {
        this.waitQueue.push(resolve);
      }.bind(this));
    },

    onThreadError: function(error) {
      console.error(error);
    }
  };

  self.MeatScopeThreadAllocator = MeatScopeThreadAllocator;

})(typeof self !== 'undefined' ? self : this);
