(function(self) {
  'use strict';

  self.importScripts(['/bower_components/gif.js/dist/libgif.js']);

  function MeatScopeThread(port) {
    this.port = port;
    this.port.addEventListener('message', this.onMessage.bind(this));
    this.port.start();
  }

  MeatScopeThread.prototype = {
    onMessage: function(event) {
      var data = event.data;

      if (!data) {
        return;
      }

      switch (data.type) {
        case 'meat-scope-reset':
          // TODO: Reset if necessary...
          break;
        case 'meat-scope-convert-frame':
          this.gifEncode(data.frame).then(function(_data) {
            this.port.postMessage({
              type: 'meat-scope-frame-converted',
              index: data.frame.index,
              data: _data
            });
          }.bind(this));
      }
    },

    gifEncode: function(frame) {
      var gifEncoder = new GIFEncoder(frame.width, frame.height);

      if (frame.index === 0) {
        gifEncoder.writeHeader();
      } else {
        gifEncoder.firstFrame = false;
      }

      gifEncoder.setRepeat(0);
      gifEncoder.setDelay(1000/24);

      if (frame.globalPalette) {
        gifEncoder.setGlobalPalette(frame.globalPalette);
      } else {
        gifEncoder.setGlobalPalette(false);
      }

      gifEncoder.addFrame(frame.imageData.data);

      if (frame.index === (frame.total - 1)) {
        gifEncoder.finish();
      }

      var byteArray = gifEncoder.stream();
      var byteArrayLength =
          (byteArray.pages.length - 1) * byteArray.constructor.pageSize +
          byteArray.cursor;
      var data = new Uint8Array(byteArrayLength);
      var offset = 0;

      for (var i = 0; i < byteArray.pages.length; ++i) {
        var page = byteArray.pages[i];
        if (i === byteArray.pages.length - 1) {
          data.set(page.slice(0, byteArray.cursor), offset);
          offset += byteArray.cursor;
        } else {
          data.set(page, offset);
          offset += page.length;
        }
      }

      return Promise.resolve(data);
    }
  }

  self.addEventListener('message', function(event) {
    var data = event.data;

    if (data && data.type === 'meat-scope-connect') {
      console.log('Initializing thread...');
      self.meatScopeThread =
          new MeatScopeThread(event.ports[0]);
    }
  });

})(typeof self !== 'undefined' ? self : this);
