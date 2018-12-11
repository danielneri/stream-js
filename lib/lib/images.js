var _extends = require("@babel/runtime/helpers/extends");

var fetch = require('cross-fetch');

var Headers = require('cross-fetch').Headers;

var FormData = require('form-data');

var utils = require('./utils');

var errors = require('./errors');

var StreamImageStore = function StreamImageStore() {
  this.initialize.apply(this, arguments);
};

StreamImageStore.prototype = {
  initialize: function initialize(client, token) {
    this.client = client;
    this.token = token;
  },
  // React Native does not auto-detect MIME type, you need to pass that via contentType
  // param. If you don't then Android will refuse to perform the upload
  upload: function upload(uri, name, contentType) {
    var data = new FormData();
    var fileField;

    if (utils.isReadableStream(uri)) {
      fileField = uri;
    } else {
      fileField = {
        uri: uri,
        name: name || uri.split('/').reverse()[0]
      };

      if (contentType != null) {
        fileField.type = contentType;
      }
    }

    data.append('file', fileField);
    return fetch("".concat(this.client.enrichUrl('images/'), "?api_key=").concat(this.client.apiKey), {
      method: 'post',
      body: data,
      headers: new Headers({
        Authorization: this.token
      })
    }).then(function (r) {
      var responseData = r.json();

      if (r.ok) {
        return responseData;
      }

      r.statusCode = r.status;
      throw new errors.StreamApiError(r.body + ' with HTTP status code ' + r.status, responseData, r);
    });
  },
  delete: function _delete(uri) {
    return this.client.delete({
      url: "images/",
      qs: {
        url: uri
      },
      signature: this.token
    });
  },
  process: function process(uri, options) {
    var params = _extends(options, {
      url: uri
    });

    if (Array.isArray(params.crop)) {
      params.crop = params.crop.join(',');
    }

    return this.client.get({
      url: "images/",
      qs: params,
      signature: this.token
    });
  },
  thumbmail: function thumbmail(uri, w, h) {
    var _ref = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {
      crop: 'center',
      resize: 'clip'
    },
        crop = _ref.crop,
        resize = _ref.resize;

    return this.process(uri, {
      w: w,
      h: h,
      crop: crop,
      resize: resize
    });
  }
};
module.exports = StreamImageStore;