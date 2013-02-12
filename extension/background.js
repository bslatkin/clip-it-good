/*
 * Copyright 2010 Brett Slatkin
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var OAUTH = ChromeExOAuth.initBackgroundPage({
  'request_url' : 'https://www.google.com/accounts/OAuthGetRequestToken',
  'authorize_url' : 'https://www.google.com/accounts/OAuthAuthorizeToken',
  'access_url' : 'https://www.google.com/accounts/OAuthGetAccessToken',
  'consumer_key' : 'anonymous',
  'consumer_secret' : 'anonymous',
  'scope' : 'http://picasaweb.google.com/data/',
  'app_name' : 'Clip It Good: Chrome Extension'
});

// Constants for various album types.
var PICASA = 'picasa';
var ALBUM_TYPE_STRING = {
  'picasa': 'Google+ / Picasa Web Albums'
};

// Preferences
var ALBUM_CONFIG = {};  // 'type' -> ('id' -> 'name')

function loadAlbumConfig() {
  var newAlbumConfig = localStorage.getItem('config:albums');
  if (newAlbumConfig) {
    ALBUM_CONFIG = $.parseJSON(newAlbumConfig);
  }
}

function saveAlbumConfig() {
  localStorage.setItem('config:albums', JSON.stringify(ALBUM_CONFIG));
}

// Sort albums by name.
function getSortedAlbums(albumIdNameDict) {
  var albumIdNameArray = [];
  $.each(albumIdNameDict, function(id, name) {
    albumIdNameArray.push({'id': id, 'name': name});
  });
  albumIdNameArray.sort(function(a, b) {
    if (a['name'] < b['name']) {
      return -1;
    } else if (a['name'] > b['name']) {
      return 1;
    } else {
      return 0;
    }
  });
  return albumIdNameArray;
}

function setupMenus() {
  loadAlbumConfig();

  chrome.contextMenus.removeAll(function() {
    // TODO: Sort the list somehow? Or is it already pre-sorted because
    // of the way the albums are presented during configuration?
    $.each(ALBUM_CONFIG, function(albumType, albumIdNameDict) {
      chrome.contextMenus.create({
        title: ALBUM_TYPE_STRING[albumType],
        contexts: ['image'],
        enabled: false
      });
      chrome.contextMenus.create({
        type: 'separator',
        contexts: ['image']
      });

      $.each(getSortedAlbums(albumIdNameDict), function(index, albumDict) {
        chrome.contextMenus.create({
          title: albumDict.name,
          contexts: ['image'],
          onclick: function(data, tab) {
            return handleMenuClick(
                albumDict.name, albumDict.id, data, tab)
          }
        });
      });
    });
  });
}

function handleMenuClick(albumName, albumId, data, tab) {
  chrome.pageAction.setTitle({
    tabId: tab.id,
    title: 'Clip It Good: Uploading (' + data.srcUrl.substr(0, 100) + ')'
  });
  chrome.pageAction.show(tab.id);

  var img = document.createElement('img');
  img.onload = function() {
    var canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext('2d').drawImage(img, 0, 0);

    // Picasa doesn't like
    var filename = data.srcUrl;
    if (filename.length > 255) {
      filename = data.srcUrl.substr(0, 255);
    }

    var dataUrl = canvas.toDataURL();
    var dataUrlAdjusted = dataUrl.replace('data:image/png;base64,', '');

    var blob = new Blob(
        [new Uint8Array(Base64.decode(dataUrlAdjusted).buffer)],
        {type: 'image/png'});

    function complete(resp, xhr) {
      chrome.pageAction.hide(tab.id);
      if (!(xhr.status >= 200 && xhr.status <= 299)) {
        alert('Error: Response status = ' + xhr.status +
              ', response body = "' + xhr.responseText + '"');
      }
    }  // end complete

    OAUTH.authorize(function() {
      OAUTH.sendSignedRequest(
        'http://picasaweb.google.com/data/feed/api/' +
        'user/default/albumid/' + albumId,
        complete,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'image/png',
            'Slug': filename
          },
          parameters: {
            alt: 'json'
          },
          body: blob
        }
      );
    });
  }  // end onload

  img.src = data.srcUrl;
}

$(document).ready( function() {
  setupMenus();
});