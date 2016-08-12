(function(self) {
  'use strict';

  self.importScripts(['/bower_components/gif.js/dist/libgif.js']);
  self.importScripts(['/src/meat-scope-app/meat-scope-media-converter/thread-allocator.js']);

  function MeatScopeSlicer(source, settings) {
    this.source = source;
    this.settings = settings;
    this.cellsPerPage = source.gridWidth * source.gridHeight;

    this.sourceFrameCount = 0;

    for (var i = 0; i < this.source.pages.length; ++i) {
      this.sourceFrameCount += this.source.pages[i].cells;
    }

    this.totalFrameCount = this.sourceFrameCount;

    if (this.settings.rewind) {
      this.totalFrameCount *= 2;
    }
  }

  MeatScopeSlicer.prototype = {
    readFrame: function(index) {
      index = index % this.totalFrameCount;

      if (!(index < this.sourceFrameCount)) {
        index = this.sourceFrameCount - (index - (this.sourceFrameCount - 1));
      }

      var pixelBuffer = this.source;
      // TODO: Investigate caching these to avoid memory churn:
      var frame = new ImageData(this.width, this.height);
      var pageIndex = 0|(index / this.cellsPerPage);
      var page = pixelBuffer.pages[pageIndex];
      var cellIndex = index - pageIndex * this.cellsPerPage;
      var frameAtATime = pixelBuffer.gridWidth === 1;
      var cellPixelWidth = pixelBuffer.width * 4;
      var rowPixelWidth = pixelBuffer.gridWidth * cellPixelWidth;

      var xOffset = cellIndex % pixelBuffer.gridWidth * cellPixelWidth;
      var yOffset = (0|(cellIndex / pixelBuffer.gridWidth)) * this.height;
      var data = page.imageData.data;

      if (frameAtATime) {
        var linearOffset = yOffset * rowPixelWidth + xOffset;

        frame.data.set(
            data.slice(
                linearOffset,
                linearOffset + cellPixelWidth * (this.height)),
            0);
      } else {
        for (var y = 0; y < this.height; ++y) {
          var linearOffset =
              (yOffset + y) * rowPixelWidth + xOffset;
          var frameOffset = y * cellPixelWidth;

          // Copy data one row of pixels at a time from a cell in a page of the
          // pixel buffer into the frame:
          frame.data.set(
              data.slice(linearOffset, linearOffset + cellPixelWidth),
              frameOffset);
        }
      }

      return frame;
    },

    get width() {
      return this.source.width;
    },

    get height() {
      return this.source.height;
    },

    get frameCount() {
      return this.totalFrameCount;
    },

    forEach: function(callback, context) {
      context = context || this;

      for (var index = 0; index < this.frameCount; ++index) {
        var frame = this.readFrame(index);
        callback.call(context, frame, index, this);
      }
    }
  }


  function MeatScopeGifEncoder(width, height) {
    this.gifEncoder = new GIFEncoder(width, height);
    this.gifEncoder.writeHeader();

    this.gifEncoder.setRepeat(0);
    this.gifEncoder.setDelay(1000/24);
  }

  MeatScopeGifEncoder.prototype = {
    addFrame: function(frame) {
      this.gifEncoder.setGlobalPalette(false);
      this.gifEncoder.addFrame(frame.data);
    },

    finish: function() {
      this.gifEncoder.finish();

      var byteArray = this.gifEncoder.stream();
      var byteArrayLength =
          byteArray.pages.length * byteArray.constructor.pageSize;
      var data = new Uint8Array(byteArrayLength);
      var offset = 0;

      for (var j = 0; j < byteArray.pages.length; j++) {
        var page = byteArray.pages[j];
        data.set(page, offset);
        offset += page.length;
      }

      return Promise.resolve({
        blob: new Blob([data], { type: 'image/gif' }),
        type: 'image/gif'
      });
    }
  };


  var nextConverterId = 0;

  function MeatScopeMediaConverter(input, settings) {
    this.id = nextConverterId++;
    this.input = input;
    this.settings = settings;

    this.slicer = new MeatScopeSlicer(this.input, this.settings);
    console.log('Media converter created...');
  };

  MeatScopeMediaConverter.prototype = {
    to: function(outputType, progressHandler) {
      return new Promise(function(resolve, reject) {
        var slicer = this.slicer;
        var encoder = new MeatScopeGifEncoder(slicer.width, slicer.height);
        var index = 0;

        (function nextFrame() {
          var frame = slicer.readFrame(index++);
          encoder.addFrame(frame);

          if (progressHandler) {
            progressHandler(index, slicer.frameCount);
          }

          if (index < slicer.frameCount) {
            self.setTimeout(nextFrame, 0);
          } else {
            resolve(encoder.finish());
          }
        })();
      }.bind(this));
    }
  }

  function MeatScopeMultithreadedMediaConverter(input, settings, threadAllocator) {
    this.id = nextConverterId++;
    this.threadAllocator = threadAllocator;
    this.slicer = new MeatScopeSlicer(input, settings);
    console.log('Multithreaded media converter created...');
  }

  MeatScopeMultithreadedMediaConverter.prototype = {
    to: function(outputType, progressHandler) {
      var jobs = [];
      var completed = 0;
      var threadAllocator = this.threadAllocator;

      this.slicer.forEach(function(imageData, index, slicer) {
        jobs.push(threadAllocator.awaitThread().then(function(port) {
          console.log('Processing frame', index);
          var result = new Promise(function(resolve, reject) {
            port.addEventListener('message', function onMessage(event) {
              if (event.data &&
                  event.data.type === 'meat-scope-frame-converted' &&
                  event.data.index === index) {
                port.removeEventListener('message', onMessage);
                console.log('Freeing thread used to process frame', index);
                threadAllocator.freeThread(port);

                completed++;

                if (progressHandler) {
                  progressHandler(completed, slicer.frameCount);
                }

                resolve(event.data.data);
              }
            });
          });

          port.postMessage({
            type: 'meat-scope-convert-frame',
            frame: {
              imageData: imageData,
              width: this.slicer.width,
              height: this.slicer.height,
              index: index,
              total: this.slicer.frameCount
            }
          });

          return result;
        }.bind(this)));
      }, this);

      return Promise.all(jobs).then(function(parts) {
        return {
          blob: new Blob(parts, { type: 'image/gif' }),
          type: 'image/gif'
        };
      }.bind(this));
    }
  };

  self.MeatScopeMediaConverter = MeatScopeMediaConverter;
  self.MeatScopeMultithreadedMediaConverter = MeatScopeMultithreadedMediaConverter;

})(typeof self !== 'undefined' ? self : this);
