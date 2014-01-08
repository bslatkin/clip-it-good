/*
 * Copyright 2010-2014 Brett Slatkin
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

var BG = chrome.extension.getBackgroundPage();

// Generic album listing
function populateAlbumList() {
  var connectedAlbums = $('#connected-list');
  connectedAlbums.contents().remove();

  BG.loadAlbumConfig();
  if ($.isEmptyObject(BG.ALBUM_CONFIG)) {
    connectedAlbums.text('No albums connected.');
    return;
  }

  $.each(BG.ALBUM_CONFIG, function(albumType, albumIdNameDict) {
    var albumSectionTitle = $('<h3 class="album-section-title">');
    albumSectionTitle.text(BG.ALBUM_TYPE_STRING[albumType]);
    connectedAlbums.append(albumSectionTitle);

    var albumSection = $('<ul class="album-section">');
    albumSection.addClass('album-type-' + albumType);

    $.each(BG.getSortedAlbums(albumIdNameDict), function(index, albumDict) {
      var album = $('<li class="connected-album">');
      album.attr('album-id', albumDict['id']);
      album.text(albumDict['name'] + ' ');
      var removeLink = $('<a href="">').text('(Remove)');
      removeLink.click(function(event) {
        delete BG.ALBUM_CONFIG[albumType][albumDict['id']];
        if ($.isEmptyObject(BG.ALBUM_CONFIG[albumType])) {
          delete BG.ALBUM_CONFIG[albumType];
        }
        album.remove();

        BG.saveAlbumConfig();
        populateAlbumList();
        BG.setupMenus();

        event.preventDefault();
        return false;
      });
      album.append(removeLink);
      albumSection.append(album);
    });

    connectedAlbums.append(albumSection);
  });
}

// Generic album selection
function renderAlbumSelector(albumIdToName, albumType) {
  var selectAlbumDiv = $('#select-album');
  selectAlbumDiv.children('.album-type')
      .text(BG.ALBUM_TYPE_STRING[albumType]);

  var albumList = selectAlbumDiv.children('.album-list');
  albumList.contents().remove();
  $.each(albumIdToName, function(albumId, albumName) {
    var albumEntry = $('<li>');
    albumEntry.attr('album-id', albumId);
    albumEntry.text(albumName);
    albumList.append(albumEntry);
  });
  albumList.selectable();

  selectAlbumDiv.dialog({
    modal: true,
    resizable: false,
    width: 550,
    title: 'Connect an album',
    buttons: {
      'Add': function() {
        var selectedAlbums = $('#select-album>.album-list>.ui-selected');
        $.each(selectedAlbums, function(index, item) {
          if (!BG.ALBUM_CONFIG[albumType]) {
            BG.ALBUM_CONFIG[albumType] = {};
          }
          BG.ALBUM_CONFIG[albumType][$(item).attr('album-id')] =
              $(item).text();
        });
        BG.saveAlbumConfig();
        populateAlbumList();
        BG.setupMenus();
        $(this).dialog('close');
      },
      'Cancel': function() {
        $(this).dialog('close');
      }
    }
  });
}

// Picasa-specific album selection
function picasaListAlbumsDone(jsonData) {
  var albumIdToName = {};
  $.each(jsonData.feed.entry, function(index, entryData) {
    albumIdToName[entryData['gphoto$id']['$t']] = entryData.title['$t'];
  });
  renderAlbumSelector(albumIdToName, BG.PICASA);
}

function addPicasaAlbum() {
  BG.OAUTH.authorize(function() {
    BG.OAUTH.sendSignedRequest(
      'http://picasaweb.google.com/data/feed/api/user/default',
      function(resp, xhr) {
        if (!(xhr.status >= 200 && xhr.status <= 299)) {
          alert('Error: Response status = ' + xhr.status +
                ', response body = "' + xhr.responseText + '"');
          return;
        }
        var jsonResponse = $.parseJSON(resp);
        picasaListAlbumsDone(jsonResponse);
      },
      {method: 'GET', parameters: {'alt': 'json'}})
  });
}

$(document).ready(function() {
  $('#add-picasa').click(addPicasaAlbum);
  populateAlbumList();
});
