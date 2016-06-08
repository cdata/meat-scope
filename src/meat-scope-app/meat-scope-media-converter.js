(function(self) {
  'use strict';

  // Whammy automatically tries to add itself to window:
  if (!self.window) {
    self.window = self;
  }

  self.importScripts(['/bower_components/whammy/whammy.js']);
  self.importScripts(['/bower_components/gif.js/dist/libgif.js']);
  self.importScripts(['/bower_components/libwebpjs/index.js']);

  function MeatScopePixelBufferSlicer(source) {
    this.source = source;
    this.cellsPerPage = source.gridWidth * source.gridHeight;
    this.lastFrame = new ImageData(source.width, source.height);

    this.count = 0;

    for (var i = 0; i < this.source.pages.length; ++i) {
      this.count += this.source.pages[i].cells;
    }
  }

  MeatScopePixelBufferSlicer.prototype = {
    readFrame: function(index) {
      var pixelBuffer = this.source;
      var frame = this.lastFrame;
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
                linearOffset + cellPixelWidth * (this.height - 1)),
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
      return this.count;
    }
  };


  function MeatScopeFrameSetSlicer(source) {
    this.source = source;
  }

  MeatScopeFrameSetSlicer.prototype = {
    readFrame: function(index) {
      return this.source.frames[index];
    },

    get width() {
      return this.source.width;
    },

    get height() {
      return this.source.height;
    },

    get frameCount() {
      return this.source.frames.length;
    }
  };


  function MeatScopeGifEncoder(width, height) {
    this.gifEncoder = new GIFEncoder();
    this.gifEncoder.writeHeader();

    this.gifEncoder.setRepeat(0);
    this.gifEncoder.setDelay(1000/24);
  }

  MeatScopeGifEncoder.prototype = {
    addFrame: function(frame) {
      gifEncoder.setGlobalPalette(false);
      gifEncoder.addFrame(frame.data);
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

      return Promise.resolve(new Blob([data], { type: 'image/gif' }));
    }
  }


  function MeatScopeWhammyEncoder(width, height) {
    this.whammy = new self.Whammy.Video(1000/24);
  }

  MeatScopeWhammyEncoder.prototype = {
    addFrame: function(frame) {
      this.whammy.frames.push({
        image: frame,
        duration: this.whammy.duration
      });
    },

    finish: function() {
      return new Promise(function(resolve) {
        this.whammy.compile(null, resolve);
      }.bind(this));
    }
  };


  function MeatScopeWebmEncoder(width, height) {
    MeatScopeWhammyEncoder.apply(this, arguments);

    this.width = width;
    this.height = height;
    this.encoder = new WebPEncoder();

    this.encoder.WebPEncodeConfig({
      target_size: 0,
      target_PSNR: 0.,
      method: 3, // quality, 0 - 6
      sns_strength: 50, // spatial noise shaping, 0 - 100
      filter_strength: 20, // 0 (off) - 100 (strongest)
      filter_sharpness: 0, // 0 (off) - 7 (least sharp)
      filter_type: 0, // 0: simple, 1: strong (only if strength > 0 or autofilter > 0)
      partitions: 0, // log2(number of token partitions) in [0..3]
      segments: 4, // max segments, 1 - 4
      pass: 1, // number of entropy-analysis passes, 1 - 10
      show_compressed: 0, // boolean
      preprocessing: 0, // preprocessing filter, 0: none, 1: segment-smooth
      autofilter: 0, // boolean
      partition_limit: 0, // ???
      extra_info_type: 2, // print extra_info ???
      preset: 0 // 0: default, 1: picture, 2: photo, 3: drawing, 4: icon, 5: text
    });
  }

  MeatScopeWebmEncoder.prototype =
      Object.create(MeatScopeWhammyEncoder.prototype);

  MeatScopeWebmEncoder.prototype.addFrame = function(frame) {
    var dataUrl;

    if (frame instanceof ImageData) {
      var result = { output: '' };
      var size = this.encoder.WebPEncodeRGBA(
          frame.data,
          this.width,
          this.height,
          this.width * 4,
          100, // quality, 0 - 100
          result);
      dataUrl = 'data:image/webp;base64,' + btoa(result.output);
    } else {
      dataUrl = frame;
    }

    MeatScopeWhammyEncoder.prototype.addFrame.call(this, dataUrl);
  };


  var slicerMap = {
    frameSet: MeatScopeFrameSetSlicer,
    pixelBuffer: MeatScopePixelBufferSlicer
  };

  var encoderMap = {
    gif: MeatScopeGifEncoder,
    webm: MeatScopeWebmEncoder
  };

  function MeatScopeMediaConverter(input) {
    this.progressHandlers = [];
    this.input = input;

    var Slicer = slicerMap[input.type];

    this.slicer = new Slicer(this.input);
  };

  MeatScopeMediaConverter.prototype = {
    to: function(outputType, progressHandler) {
      return new Promise(function(resolve, reject) {
        var slicer = this.slicer;
        var Encoder = encoderMap[outputType];
        var encoder = new Encoder(slicer.width, slicer.height);
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

  self.MeatScopeMediaConverter = MeatScopeMediaConverter;

})(typeof self !== 'undefined' ? self : this);
