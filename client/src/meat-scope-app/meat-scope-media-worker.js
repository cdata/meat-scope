self.importScripts(['/src/meat-scope-app/meat-scope-media-converter.js']);
self.importScripts(['/src/meat-scope-app/meat-scope-media-converter/thread-allocator.js']);

function MeatScopeMediaWorker() {
  this.jobQueue = Promise.resolve();
  this.conversionObservers = [];
  this.threadAllocator = null;
}

MeatScopeMediaWorker.prototype = {
  registerClient: function(port) {
    console.log('Media Worker client connected...');
    port.addEventListener('message', this.onClientMessage.bind(this, port));
    port.start();
    port.postMessage({
      type: 'meat-scope-connected'
    });
  },

  enqueueJob: function(job) {
    return this.jobQueue = this.jobQueue.then(function() {
      return job.call(this);
    }.bind(this)).catch(function(error) {
      console.error('Job failed.', error);
    });
  },

  notifyConversionObservers: function(message) {
    this.conversionObservers.forEach(function(port) {
      port.postMessage(message);
    });
  },

  onClientMessage: function(port, event) {
    var data = event.data;

    if (!data) {
      return;
    }

    switch (data.type) {
      case 'meat-scope-announce-thread-pool':
        this.threadAllocator = new MeatScopeThreadAllocator(event.ports);
        break;
      case 'meat-scope-observe-conversions':
        this.conversionObservers.push(port);
        break;
      case 'meat-scope-ignore-conversions':
        var index = this.conversionObservers.indexOf(port);
        if (index > -1) {
          this.conversionObservers.splice(index, 1);
        }
        break;
      case 'meat-scope-convert-to-video':
        var converter = this.threadAllocator ?
            new MeatScopeMultithreadedMediaConverter(
                data.input, this.threadAllocator) :
            new MeatScopeMediaConverter(data.input);

        this.notifyConversionObservers({
          type: 'meat-scope-conversion-enqueued',
          converterId: converter.id
        });

        this.enqueueJob(function() {
          return converter.to(data.outputType, function(progress, total) {
            this.notifyConversionObservers({
              type: 'meat-scope-conversion-progress',
              converterId: converter.id,
              progress: progress,
              total: total
            });
          }.bind(this)).then(function(video) {
            var message = {
              type: 'meat-scope-conversion-complete',
              id: data.id,
              converterId: converter.id,
              video: video
            };
            this.notifyConversionObservers(message);
            port.postMessage(message);
          }.bind(this)).catch(function(error) {
            var error = {
              type: 'error',
              id: data.id,
              converterId: converter.id,
              error: error
            };
            this.notifyConversionObservers(error);
            port.postMessage(error);
          });
        });

        break;
    }
  }
};


self.meatScopeMediaWorker = new MeatScopeMediaWorker();
console.log('Media Worker created...');

self.addEventListener('connect', function(event) {
  self.meatScopeMediaWorker.registerClient(event.ports[0]);
});
