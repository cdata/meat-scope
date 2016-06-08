self.importScripts(['meat-scope-media-converter.js']);

function MeatScopeMediaWorker() {}

MeatScopeMediaWorker.prototype = {
  registerClient: function(port) {
    port.addEventListener('message', this.onClientMessage.bind(this, port));
    port.start();
    port.postMessage({
      type: 'meat-scope-connected'
    });
  },

  convert: function(input) {
    return new MeatScopeMediaConverter(input);
  },

  onClientMessage: function(port, event) {
    var data = event.data;

    if (!data) {
      return;
    }

    switch (data.type) {
      case 'meat-scope-convert-to-video':
        this.convert(data.input).to(data.outputType, function(progress, total) {
          port.postMessage({
            type: 'meat-scope-video-progress',
            progress: progress,
            total: total
          });
        }).then(function(blob) {
          port.postMessage({
            type: 'meat-scope-video-ready',
            id: data.id,
            blob: blob
          });
        });
        break;
    }
  }
};

self.meatScopeMediaWorker = new MeatScopeMediaWorker();

self.addEventListener('connect', function(event) {
  self.meatScopeMediaWorker.registerClient(event.ports[0]);
});
