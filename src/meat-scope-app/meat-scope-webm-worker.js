// Whammy automatically tries to add itself to window:
if (!self.window) {
  self.window = self;
}

self.importScripts(['/bower_components/whammy/whammy.js']);

function MeatScopeVideo(fps) {
  this.id = MeatScopeVideo.nextVideoId++;
  this.whammy = new Whammy.Video(fps);
}

MeatScopeVideo.nextVideoId = 0;

MeatScopeVideo.prototype = {
  addFrame: function(imageData, duration) {
    this.whammy.frames.push({
      image: imageData,
      duration: this.whammy.duration
    });
  },

  compile: function() {
    return new Promise(function(resolve) {
      this.whammy.compile(null, resolve);
    }.bind(this));
  }
};

function MeatScopeWebMWorker() {
  this.videos = {};
}

MeatScopeWebMWorker.prototype = {
  makeWebMFromFrames: function(frames, fps) {
    return this.startNewVideo(fps).then(function(video) {
      for (var i = 0; i < frames.length; ++i) {
        // video.addFrame(frames[i].image, frames[i].duration);
        video.addFrame(frames[i]);
      }
      return this.finishVideo(video.id);
    }.bind(this));
  },

  startNewVideo: function(fps) {
    var video = new MeatScopeVideo(fps);
    this.videos[video.id] = video;
    return Promise.resolve(video);
  },

  addVideoFrame: function(videoId, imageData) {
    return this.getVideoById(videoId).then(function() {
      return video.addFrame(imageData);
    });
  },

  finishVideo: function(videoId) {
    return this.getVideoById(videoId).then(function(video) {
      return video.compile().then(function(blob) {
        this.videos[video.id] = null;
        return {
          blob: blob,
          url: URL.createObjectURL(blob)
        };
      }.bind(this));
    }.bind(this));
  },

  getVideoById: function(id) {
    if (this.videos[id]) {
      return Promise.resolve(this.videos[id]);
    } else {
      return Promise.reject(new Error('No video with ID ' + videoId));
    }
  },

  registerClient: function(port) {
    port.addEventListener('message', this.onClientMessage.bind(this, port));
    port.start();
    port.postMessage({
      type: 'meat-scope-connected'
    });
  },

  onClientMessage: function(port, event) {
    var data = event.data;

    if (!data) {
      return;
    }

    switch (data.type) {
      case 'meat-scope-frames-to-webm':
        this.makeWebMFromFrames(data.frames, data.fps).then(function(webm) {
          port.postMessage({
            type: 'meat-scope-video-ready',
            id: data.id,
            webm: webm
          });
        });
        break;
    }
  }
};

self.meatScopeWebMWorker = new MeatScopeWebMWorker();

self.addEventListener('connect', function(event) {
  self.meatScopeWebMWorker.registerClient(event.ports[0]);
});
