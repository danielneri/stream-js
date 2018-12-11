var fetch = require('cross-fetch');

var Headers = require('cross-fetch').Headers;

var utils = require('./utils');

var FormData = require('form-data');

var errors = require('./errors');

var StreamFileStore = function StreamFileStore() {
  this.initialize.apply(this, arguments);
};

StreamFileStore.prototype = {
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
    return fetch("".concat(this.client.enrichUrl('files/'), "?api_key=").concat(this.client.apiKey), {
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
      url: "files/",
      qs: {
        url: uri
      },
      signature: this.token
    });
  }
};
module.exports = StreamFileStore;