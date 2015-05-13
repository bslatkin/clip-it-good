/*
 * Copyright 2010-2015 Brett Slatkin
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

// Constants for various album types.
var PICASA = 'picasa';
var ALBUM_TYPE_STRING = {
  'picasa': 'Google+ Photo Albums'
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

function isXhrOk(context, xhr) {
    if (!(xhr.status >= 200 && xhr.status <= 299)) {
      alert('Error: Response status = ' + xhr.status +
            ', response body = "' + xhr.responseText + '"');
      chrome.identity.removeCachedAuthToken({'token': context.accessToken});
      return false;
  }
  return true;
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

    // Allow the user to quickly get to the options page.
    chrome.contextMenus.create({
      type: 'separator',
      contexts: ['image']
    });
    chrome.contextMenus.create({
      title: 'Options\u2026',
      contexts: ['image'],
      onclick: function() {
        chrome.tabs.create({url: 'options.html'})
      }
    });
  });
}

function getEditDescriptionXML(description) {
  var escaped = $('<div>').text(description).html();
  return "<?xml version='1.0' encoding='UTF-8'?>\n" +
    "<entry xmlns='http://www.w3.org/2005/Atom'>\n" +
    "<summary>" + escaped + "</summary>\n" +
    "</entry>\n";
}

function handleSaveDescriptionDone(context, xhr) {
  chrome.pageAction.hide(context.tab.id);
  if (!isXhrOk(context, xhr)) {
    return;
  }
}

function handleUploadDone(context, xhr) {
  if (!isXhrOk(context, xhr)) {
    return;
  }

  var responseJSON = $.parseJSON(xhr.responseText);
  var photoId = responseJSON.entry['gphoto$id']['$t'];

  function complete(xhr) {
    handleSaveDescriptionDone(context, xhr);
  }

  $.ajax(
    'https://picasaweb.google.com/data/entry/api/user/default/albumid/' +
    context.albumId + '/photoid/' + photoId + '?alt=json',
    {
      complete: complete,
      contentType: 'application/xml',
      data: getEditDescriptionXML(
          'Page: ' + context.pageUrl + '\nImage: ' + context.url),
      dataType: 'json',
      error: complete,
      headers: {
        'Authorization': 'Bearer ' + context.accessToken,
        'GData-Version': '2',
        'If-Match': '*'
      },
      method: 'PATCH'
    }
  );
}

function handleFetchDone(context, xhr) {
  if (!isXhrOk(context, xhr)) {
    return;
  }

  var blob = xhr.response;

  // Picasa doesn't like overly long slugs. It will only keep the last
  // part of the URL as the image name.
  var slug = context.url;
  if (slug.length > 255) {
    slug = context.url.substr(0, 255);
  }

  // Use the XHR API directly so we can get Blob values.
  // jQuery doesn't support blobs: http://bugs.jquery.com/ticket/11461
  var upload = new XMLHttpRequest();

  var complete = function() {
    handleUploadDone(context, upload);
  }

  upload.onload = complete;
  upload.onerror = complete;
  upload.open(
      'post',
      'https://picasaweb.google.com/data/feed/api/' +
      'user/default/albumid/' + context.albumId + '?alt=json');
  upload.setRequestHeader('Authorization', 'Bearer ' + context.accessToken);
  upload.setRequestHeader('Content-Type', 'image/png');
  upload.setRequestHeader('Slug', slug || 'empty');
  upload.send(blob);
}

function handleMenuClick(albumName, albumId, data, tab) {
  chrome.pageAction.setTitle({
    tabId: tab.id,
    title: 'Clip It Good: Uploading (' + data.srcUrl.substr(0, 100) + ')'
  });
  chrome.pageAction.show(tab.id);

  var context = {
    albumId: albumId,
    albumName: albumName,
    pageUrl: data.pageUrl,
    tab: tab,
    url: data.srcUrl
  };

  chrome.identity.getAuthToken({'interactive': true}, function(accessToken) {
    context.accessToken = accessToken;

    // Use the XHR API directly so we can get Blob values.
    // jQuery doesn't support blobs: http://bugs.jquery.com/ticket/11461
    var xhr = new XMLHttpRequest();
    xhr.responseType = 'blob';
    xhr.onload = function() {
      handleFetchDone(context, xhr);
    };
    xhr.onerror = function(e) {
      console.log('Could not fetch image: ' + e);
      alert('Could not fetch image: ' + e);
    };
    xhr.open('get', context.url);
    xhr.send();
  });
}

function firstTimeOptions() {
  if (localStorage.getItem('config:installed') ||
      localStorage.getItem('config:config')) {
    return;
  }
  localStorage.setItem('config:installed', true);
  chrome.tabs.create({url: 'options.html'});
}

$(document).ready(function() {
  setupMenus();
  firstTimeOptions();
});
