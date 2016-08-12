(function(self) {
  'use strict';

  self.importScripts(['/bower_components/js-objectdetect/js/objectdetect.js']);
  self.importScripts(['/bower_components/js-objectdetect/js/objectdetect.frontalface_alt.js']);
  self.importScripts(['/bower_components/js-objectdetect/js/objectdetect.frontalface.js']);

  // This is basically the detector class from objectdetect (much of the code
  // is a straight copy-paste job), but code that relies on the DOM / Canvas
  // has been removed or adapted for a Worker:
  function MeatScopeFaceDetector(width, height, scaleFactor) {
    var classifier = objectdetect.frontalface_alt;
    // var classifier = objectdetect.frontalface;

    this.width = width;
    this.height = height;
    this.tilted = classifier.tilted;
    this.scaleFactor = scaleFactor;
    this.numScales = ~~(Math.log(
        Math.min(width / classifier[0], height / classifier[1]))
        / Math.log(scaleFactor));
    this.scaledGray = new Uint32Array(width * height);
    this.compiledClassifiers = [];
    var scale = 1;
    for (var i = 0; i < this.numScales; ++i) {
      var scaledWidth = ~~(width / scale);
      this.compiledClassifiers[i] =
          objectdetect.compileClassifier(classifier, scaledWidth);
      scale *= scaleFactor;
    }

    this.previousRectsList = [];
  }

  MeatScopeFaceDetector.prototype = {
    detect: function(imageData, upscale, group, stepSize, roi, canny) {
      if (stepSize === undefined) {
        stepSize = 1;
      }

      if (group === undefined) {
        group = 1;
      }

      imageData = imageData.data;

      this.gray = objectdetect.convertRgbaToGrayscale(imageData, this.gray);

      var width = this.width;
      var height = this.height;
      var rects = [];
      var scale = 1;

      for (var i = 0; i < this.numScales; ++i) {
        var scaledWidth = ~~(width / scale);
        var scaledHeight = ~~(height / scale);

        if (scale === 1) {
          this.scaledGray.set(this.gray);
        } else {
          this.scaledGray = objectdetect.rescaleImage(
              this.gray, width, height, scale, this.scaledGray);
        }

        if (canny) {
          this.canny = objectdetect.computeCanny(
              this.scaledGray, scaledWidth, scaledHeight, this.canny);
          this.cannySat = objectdetect.computeSat(
              this.canny, scaledWidth, scaledHeight, this.cannySat);
        }

        this.sat = objectdetect.computeSat(
            this.scaledGray, scaledWidth, scaledHeight, this.sat);
        this.ssat = objectdetect.computeSquaredSat(
            this.scaledGray, scaledWidth, scaledHeight, this.ssat);
        if (this.tilted) {
          this.rsat = objectdetect.computeRsat(
              this.scaledGray, scaledWidth, scaledHeight, this.rsat);
        }

        var newRects = objectdetect.detect(
            this.sat,
            this.rsat,
            this.ssat,
            this.cannySat,
            scaledWidth,
            scaledHeight,
            stepSize,
            this.compiledClassifiers[i]);

        for (var j = newRects.length - 1; j >= 0; --j) {
          var newRect = newRects[j];
          newRect[0] *= scale;
          newRect[1] *= scale;
          newRect[2] *= scale;
          newRect[3] *= scale;
        }
        rects = rects.concat(newRects);

        scale *= this.scaleFactor;
      }
      //
      // rects = (group ?
      //     objectdetect.groupRectangles(rects, group) : rects).sort(
      //         function(r1, r2) {
      //           return r2[4] - r1[4];
      //         });
      rects = objectdetect.groupRectangles(rects, group);

      rects = rects.map(function(rect) {
        return {
          x: rect[0] * upscale,
          y: rect[1] * upscale,
          width: rect[2] * upscale,
          height: rect[3] * upscale
        };
      }).filter(function(rect) {
        return Number.isFinite(rect.x + rect.y + rect.width + rect.height);
      });

      var previousRectsList = this.previousRectsList.map(
          function(previousRects) {
            return previousRects.filter(function(previousRect) {
              return !!previousRect;
            });
          });

      rects = rects.map(function(rect) {
        var closestPreviousRects =
            previousRectsList.map(function(previousRects) {
              var closestMagnitude;
              var closestIndex;

              previousRects.forEach(function(previousRect, index) {
                var dx = rect.x - previousRect.x;
                var dy = rect.y - previousRect.y;
                var magnitude = Math.sqrt(dx * dx + dy * dy);

                if (magnitude < 128 &&
                    (closestMagnitude == null || magnitude < closestMagnitude)) {
                  closestMagnitude = magnitude;
                  closestIndex = index;
                }
              });

              if (closestIndex != null) {
                return previousRects.splice(closestIndex, 1).pop();
              }
            }).filter(function(rect) {
              return !!rect;
            });

        rect.count = closestPreviousRects.length + 1;

        return closestPreviousRects.reduce(function(rect, nextRect) {
          // rect.x += nextRect.x;
          // rect.y += nextRect.y;
          rect.width += nextRect.width;
          rect.height += nextRect.height;

          // rect.x /= 2;
          // rect.y /= 2;
          rect.width /= 2;
          rect.height /= 2;

          return rect;
        }, rect);
      });

      this.previousRectsList.unshift(rects);

      if (this.previousRectsList.length > 2) {
        this.previousRectsList.pop();
      }

      return rects;
    }
  };

  self.MeatScopeFaceDetector = MeatScopeFaceDetector;

})(typeof self !== 'undefined' ? self : this);
