/* global location, chrome, crypto, DOMParser, i18nReplace, i18nReplaceImpl */
// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Grab the querystring, removing question mark at the front and splitting on
// the ampersand.
var queryString = location.search.substring(1).split("&");

// The feed URL is the first component and always present.
var feedUrl = decodeURIComponent(queryString[0]);

// This extension's ID.
var extension_id = chrome.i18n.getMessage("@@extension_id");

// During testing, we cannot load the iframe and stylesheet from an external
// source, so we allow loading them synchronously and stuff the frame with the
// results. Since this is only allowed during testing, it isn't supported for
// the official extension ID.
var synchronousRequest =
    extension_id != "nlbjncdgjeocebhnmkbbbdekmmmcbfjd" ?
        queryString[1] == "synchronous" : false;

// The XMLHttpRequest object that tries to load and parse the feed, and (if
// testing) also the style sheet and the frame js.
var req;

// Depending on whether this is run from a test or from the extension, this
// will either be a link to the css file within the extension or contain the
// contents of the style sheet, fetched through XmlHttpRequest.
var styleSheet = "";

// Depending on whether this is run from a test or from the extension, this
// will either be a link to the js file within the extension or contain the
// contents of the style sheet, fetched through XmlHttpRequest.
var frameScript = "";

// What to show when we cannot parse the feed name.
var unknownName = chrome.i18n.getMessage("rss_subscription_unknown_feed_name");

// The token to use during communications with the iframe.
var token = "";

/**
* The main function. Sets up the selection list for possible readers and
* fetches the data.
*/
function main() {
  // Set the token.
  var tokenArray  = new Uint32Array(4);
  crypto.getRandomValues(tokenArray);
  token = [].join.call(tokenArray);

  // Now fetch the data.
  req = new XMLHttpRequest();
  if (synchronousRequest) {
    // Tests that load the html page directly through a file:// url don't have
    // access to the js and css from the frame so we must load them first and
    // inject them into the src for the iframe.
    req.open("GET", "style.css", false);
    req.send(null);

    styleSheet = "<style>" + req.responseText + "</style>";

    req.open("GET", "iframe.js", false);
    req.send(null);

    if (req.responseText.indexOf('//') != -1) {
      console.log('Error: Single-line comment(s) found in iframe.js');
    } else {
      frameScript = "<script>" +
                    req.responseText +
                    "<" + "/script>";
    }
  } else {
    // Normal loading just requires links to the css and the js file.
    styleSheet = "<link rel='stylesheet' type='text/css' href='" +
                    chrome.extension.getURL("style.css") + "'>";
    frameScript = "<script src='" + chrome.extension.getURL("iframe.js") +
                  "'></" + "script>";
  }

  req.onload = handleResponse;
  req.onerror = handleError;
  req.open("GET", feedUrl, !synchronousRequest);
  // Not everyone sets the mime type correctly, which causes handleResponse
  // to fail to XML parse the response text from the server. By forcing
  // it to text/xml we avoid this.
  req.overrideMimeType('text/xml');
  req.send(null);

  document.getElementById('feedUrl').textContent = feedUrl;
}

// Sets the title for the feed.
function setFeedTitle(title) {
  var titleTag = document.getElementById('title');
  titleTag.textContent =
      chrome.i18n.getMessage("rss_subscription_feed_for", title);
}

// Handles errors during the XMLHttpRequest.
function handleError() {
  handleFeedParsingFailed(
      chrome.i18n.getMessage("rss_subscription_error_fetching"));
}

// Handles feed parsing errors.
function handleFeedParsingFailed(error) {
  setFeedTitle(unknownName);

  // The tests always expect an IFRAME, so add one showing the error.
  var html = "<body><span id=\"error\" class=\"item_desc\">" + error +
               "</span></body>";

  var error_frame = createFrame('error', html);
  var itemsTag = document.getElementById('items');
  itemsTag.appendChild(error_frame);
}

function createFrame(frame_id, html) {
  // During testing, we stuff the iframe with the script directly, so we relax
  // the policy on running scripts under that scenario.
  var csp = synchronousRequest ?
      '<meta http-equiv="content-security-policy" ' +
          'content="object-src \'none\'">' :
      '<meta http-equiv="content-security-policy" ' +
          'content="object-src \'none\'; script-src \'self\'">';
  var frame = document.createElement('iframe');
  frame.id = frame_id;
  frame.src = "data:text/html;charset=utf-8,<html>" + csp +
              "<!--Token:" + extension_id + token +
              "-->" + html + "</html>";
  frame.scrolling = "auto";
  frame.frameBorder = "0";
  frame.marginWidth = "0";
  return frame;
}

// Handles parsing the feed data we got back from XMLHttpRequest.
function handleResponse() {
  // Uncomment these three lines to see what the feed data looks like.
  // var itemsTag = document.getElementById('items');
  // itemsTag.textContent = req.responseText;
  // return;

  var doc = req.responseXML;
  if (!doc) {
    // If the XMLHttpRequest object fails to parse the feed we make an attempt
    // ourselves, because sometimes feeds have html/script code appended below a
    // valid feed, which makes the feed invalid as a whole even though it is
    // still parsable.
    var domParser = new DOMParser();
    doc = domParser.parseFromString(req.responseText, "text/xml");
    if (!doc) {
      handleFeedParsingFailed(
          chrome.i18n.getMessage("rss_subscription_not_valid_feed"));
      return;
    }
  }

  // We must find at least one 'entry' or 'item' element before proceeding.
  var entries = doc.getElementsByTagName('entry');
  if (entries.length == 0)
    entries = doc.getElementsByTagName('item');
  if (entries.length == 0) {
    handleFeedParsingFailed(
        chrome.i18n.getMessage("rss_subscription_no_entries"));
    return;
  }

  // Figure out what the title of the whole feed is.
  var title = doc.getElementsByTagName('title')[0];
  if (title)
    setFeedTitle(title.textContent);
  else
    setFeedTitle(unknownName);

  // Embed the iframe.
  var itemsTag = document.getElementById('items');
  // TODO(aa): Add base URL tag
  var iframe = createFrame('rss', styleSheet + frameScript);
  itemsTag.appendChild(iframe);
}

document.addEventListener('DOMContentLoaded', function () {
  document.title =
      chrome.i18n.getMessage("rss_subscription_default_title");
  i18nReplace('rss_subscription_subscribe_using');
  i18nReplace('rss_subscription_subscribe_button');
  i18nReplace('rss_subscription_always_use');
  i18nReplace('rss_subscription_feed_preview');

  main();
});

window.addEventListener("message", function(e) {
  if (e.ports[0] && e.data === token)
    e.ports[0].postMessage(req.responseText);
}, false);
