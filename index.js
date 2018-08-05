const urllibsync = require("urllib-sync");
const urlencode = require("urlencode");
const config = require("nconf");


// Load environment variables and secrets off config.json
config.argv().env().file({file: "config.json"}).defaults({
  "adminChannel": "music",
  "standardChannel": "music",
  "maxVolume": "75",
  "market": "US",
  "blacklist": [],
  "searchLimit": 7
});

const adminChannel = config.get("adminChannel");
const standardChannel = config.get("standardChannel");
const token = config.get("token");
const maxVolume = config.get("maxVolume");
const market = config.get("market");
let blacklist = config.get("blacklist");
const apiKey = config.get("apiKey");
const searchLimit = config.get("searchLimit");
if (!Array.isArray(blacklist)) {
  blacklist = blacklist.replace(/\s*(,|^|$)\s*/g, "$1").split(/\s*,\s*/);
}

const SONOS = require("sonos");
const Sonos = SONOS.Sonos;
const sonos = new Sonos(config.get("sonosIP"));

if (market !== "US") {
  sonos.setSpotifyRegion(SONOS.SpotifyRegion.EU);
  _log("Setting Spotify region to EU...");
  _log(market);
}

let gongCounter = 0;
let gongLimit = 2;
let gongLimitPerUser = 1;
let gongScore = {};
let gongMessage = [
  "Is it really all that bad?",
  "Is it that distracting?",
  "How much is this worth to you?",
  "I agree. Who added this song anyway?",
  "Thanks! I didn't want to play this song in the first place...",
  "Look, I only played this song because it's my masters favourite.",
  "Good call!",
  "Would some harp music be better?"
];

let voteCounter = 0;
let voteLimit = 2;
let voteLimitPerUser = 1;
let voteScore = {};
let gongBanned = false;

let gongTrack = ""; // What track was a GONG called on

const RtmClient = require("@slack/client").RtmClient;
const RTM_EVENTS = require("@slack/client").RTM_EVENTS;
const MemoryDataStore = require("@slack/client").MemoryDataStore;

let slack = new RtmClient(token, {
  logLevel: "error",
  dataStore: new MemoryDataStore(),
  autoReconnect: true,
  autoMark: true
});

slack.on("open", function() {
  let channel,
    channels,
    group,
    groups,
    id,
    messages,
    unreads;
  channels = [standardChannel];
  groups = [];
  //   unreads = slack.getUnreadCount();
  channels = (function() {
    let _ref,
      _results;
    _ref = slack.channels;
    _results = [];
    for (id in _ref) {
      channel = _ref[id];
      if (channel.is_member) {
        _results.push("#" + channel.name);
      }
    }
    return _results;
  })();

  groups = (function() {
    let _ref,
      _results;
    _ref = slack.groups;
    _results = [];
    for (id in _ref) {
      group = _ref[id];
      if (group.is_open && !group.is_archived) {
        _results.push(group.name);
      }
    }
    return _results;
  })();

  //    _log("Welcome to Slack. You are @" + slack.self + " of " + slack.team);
  //    _log('You are in: ' + channels.join(', '));
  //    _log('As well as: ' + groups.join(', '));
  //    messages = unreads === 1 ? 'message' : 'messages';
  //   let channel = slack.getChannelByName(standardChannel);
  let message = ":notes: " + "Im back!!" + "\n";
  //_slackMessage(message, adminChannel);

  _log("Starting...");
  return;

});

slack.on(RTM_EVENTS.MESSAGE, (message) => {
  let channel,
    channelError,
    channelName,
    errors,
    response,
    text,
    textError,
    ts,
    type,
    typeError,
    user,
    userName;

  channel = slack.dataStore.getChannelGroupOrDMById(message.channel);
  // user = slack.dataStore.getUserById(message.user);
  response = "";
  type = message.type,
  ts = message.ts,
  text = message.text;
  channelName = (
    channel != null
    ? channel.is_channel
    : void 0)
    ? "#"
    : "";
  channelName = channelName + (
    channel
    ? channel.name
    : "UNKNOWN_CHANNEL");
  userName = "<@" + message.user + ">";
  // userName = (user != null ? user.display_name : void 0) != null ? "@" + user.name : "UNKNOWN_USER";
  _log("Received: " + type + " " + channelName + " " + userName + " " + ts + " \"" + text + "\"");
  if (type !== "message" || (text == null) || (channel == null)) {
    typeError = type !== "message"
      ? "unexpected type " + type + "."
      : null;
    textError = text == null
      ? "text was undefined."
      : null;
    channelError = channel == null
      ? "channel was undefined."
      : null;
    errors = [typeError, textError, channelError].filter(function(element) {
      return element !== null;
    }).join(" ");

    return _log("Could not respond. " + errors);
  }

  if (blacklist.indexOf(userName) !== -1) {
    _log("User " + userName + " is blacklisted");
    _slackMessage("Nice try " + userName + ", you're banned :)", channel.id);
    return false;
  }

  let input = text.split(" ");
  let term = input[0].toLowerCase();
  let matched = true;
  _log("term", term);
  switch (term) {
  case "add":
    _add(input, channel, userName);
    break;
  case "addalbum":
    _addalbum(input, channel, userName);
    break;
  case "bestof":
    _bestof(input, channel, userName);
    break;
  case "append":
    _append(input, channel, userName);
    break;
  case "searchplaylist":
    _searchplaylist(input, channel);
    break;
  case "searchalbum":
    _searchalbum(input, channel);
    break;
  case "addplaylist":
    _addplaylist(input, channel);
    break;
  case "search":
    _search(input, channel, userName);
    break;
  case "current":
  case "wtf":
    _currentTrack(channel);
    break;
  case "dong":
  case ":gong:":
  case "gong":
    _gong(channel, userName);
    break;
  case "gongcheck":
    _gongcheck(channel, userName);
    break;
  case "vote":
    _vote(channel, userName);
    break;
  case "list":
  case "ls":
  case "playlist":
    _showQueue(channel);
    break;
  case "sl":
  case "train":
    _sl(channel, userName);
    break;
  case "volume":
    _getVolume(channel);
    break;
  case "count(list)":
    _countQueue(channel);
    break;
  case "status":
    _status(channel);
    break;
  case "hello":
    _yeeeeezy(channel);
    break;
  case "help":
    _help(input, channel);
    break;
  default:
    matched = false;
    break;
  }

  if (!matched && channel.name === adminChannel) {
    switch (term) {
    case "next":
      _nextTrack(channel);
      break;
    case "gongPlay":
      _gongPlay(input, channel);
      break;
    case "stop":
      _stop(input, channel);
      break;
    case "flush":
      _flush(input, channel);
      break;
    case "play":
      _play(input, channel);
      break;
    case "pause":
      _pause(input, channel);
      break;
    case "playpause":
    case "resume":
      _resume(input, channel);
      break;
    case "previous":
      _previous(input, channel);
      break;
    case "shuffle":
      _shuffle(input, channel);
      break;
    case "setvolume":
      _setVolume(input, channel, userName);
      break;
    case "blacklist":
      _blacklist(input, channel);
      break;
    default:
      break;
    }
  }
});

slack.on("error", function(error) {
  return console.error("Error: " + error);
});

slack.login();

function _slackMessage(message, id) {
  slack.sendMessage(message, id);
}

function _log(...args) {
  // for (let val of args) {
  //     console.log(val);
  // }
  console.log(...args);
}

function _getVolume(channel) {

  sonos.getVolume(function(err, vol) {
    _log(err, vol);
    _slackMessage("Volume is " + vol + " dB", channel.id);
  });
}

function _yeeeeezy(channel) {
  let asciiArt = ":plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white:\n" +
  ":plain_white::zap::plain_white::plain_white::plain_white::zap::plain_white::zap::zap::zap::zap::plain_white::zap::zap::zap::zap::plain_white::zap::zap::zap::zap::zap::plain_white::zap::plain_white::plain_white::plain_white::zap::plain_white:\n" +
  ":plain_white::plain_white::zap::plain_white::zap::plain_white::plain_white::zap::plain_white::plain_white::plain_white::plain_white::zap::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::zap::plain_white::plain_white::plain_white::zap::plain_white::zap::plain_white::plain_white:\n" +
  ":plain_white::plain_white::plain_white::zap::plain_white::plain_white::plain_white::zap::zap::zap::plain_white::plain_white::zap::zap::zap::plain_white::plain_white::plain_white::plain_white::zap::plain_white::plain_white::plain_white::plain_white::plain_white::zap::plain_white::plain_white::plain_white:\n" +
  ":plain_white::plain_white::plain_white::zap::plain_white::plain_white::plain_white::zap::plain_white::plain_white::plain_white::plain_white::zap::plain_white::plain_white::plain_white::plain_white::plain_white::zap::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::zap::plain_white::plain_white::plain_white:\n" +
  ":plain_white::plain_white::plain_white::zap::plain_white::plain_white::plain_white::zap::zap::zap::zap::plain_white::zap::zap::zap::zap::plain_white::zap::zap::zap::zap::zap::plain_white::plain_white::plain_white::zap::plain_white::plain_white::plain_white:\n" +
  ":plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white::plain_white:";
  _slackMessage(asciiArt, channel.id);
}

function _setVolume(input, channel, userName) {
  if (channel.name !== adminChannel) {
    return;
  }

  let vol = input[1];

  if (isNaN(vol)) {
    _slackMessage("Nope.", channel.id);
    return;
  } else {
    vol = Number(vol);
    _log(vol);
    if (vol > maxVolume) {
      _slackMessage("That's a bit extreme, " + userName + "... lower please.", channel.id);
    } else {
      sonos.setVolume(vol, function(err, data) {
        _getVolume(channel);
      });
    }
  }
}

function _getQueue() {
  let res = null;
  sonos.getQueue(function(err, result) {
    res = result;
  });
  return res;
}

function _countQueue(channel, cb) {
  sonos.getQueue(function(err, result) {
    if (err) {
      if (cb) {
        return (err, null);
      }
      _log(err);
      _slackMessage("Error getting queue length", channel.id);
    } else {
      if (cb) {
        return cb(null);
      }
      _slackMessage(result.total, channel.id);
    }
  });
}

function _showQueue(channel, cb) {
  sonos.getQueue(function(err, result) {
    if (err) {
      if (cb) {
        return (err, null);
      }
      _log(err);
      _slackMessage("Seems like the queue is empty... Have you tried adding a song?!", channel.id);

    } else {
      if (cb) {
        return cb(null, result.items);
      }
      _currentTrack(channel, function(err, track) {
        let message = "Total tracks in queue: " + result.total + "\n" + "=====================";
        result.items.map(function(item, i) {
          message += "\n";
          if (item["title"] === track.title) {
            message += ":notes: " + "_#" + i + "_ *Title:* " + item["title"];
            message += " *Artist:* " + item["artist"];
          } else {
            message += ">_#" + i + "_ *Title:* " + item["title"];
            message += " *Artist:* " + item["artist"];
          }
        });
        _slackMessage(message, channel.id);
      });
    }
  });
}

// Need to track what song has had a GONG called
// If the GONG was called on the previous song, reset

function _gong(channel, userName) {

  _log("_gong...");

  _currentTrackTitle(channel, function(err, track) {
    _log("_gong > track: " + track);

    // NOTE: The gongTrack is checked in _currentTrackTitle() so we
    // need to let that go through before checking if gong is banned.
    if (gongBanned) {
      _slackMessage("Sorry " + userName + ", the people have voted and this track cannot be gonged...", channel.id);
      return;
    }

    // Get message
    _log("gongMessage.length: " + gongMessage.length);
    let ran = Math.floor(Math.random() * gongMessage.length);
    let randomMessage = gongMessage[ran];
    _log("gongMessage: " + randomMessage);

    // Need a delay before calling the rest
    if (!(userName in gongScore)) {
      gongScore[userName] = 0;
    }

    if (gongScore[userName] >= gongLimitPerUser) {
      _slackMessage("Are you trying to cheat, " + userName + "? DENIED!", channel.id);
    } else {
      if (userName in voteScore) {
        _slackMessage("Having regrets, " + userName + "? We're glad you came to your senses...", channel.id);
      }

      gongScore[userName] = gongScore[userName] + 1;
      gongCounter++;
      _slackMessage(randomMessage + " This is GONG " + gongCounter + "/" + gongLimit + " for " + track, channel.id);
      if (gongCounter >= gongLimit) {
        _slackMessage("Imma let you finish but...the music got GONGED!!", channel.id);
        _gongPlay(channel);
        setTimeout(() => _nextTrack(channel, true), 7000);
        gongCounter = 0;
        gongScore = {};
      }
    }
  });
}

function _vote(channel, userName) {
  _log("_vote...");
  _currentTrackTitle(channel, function(err, track) {
    _log("_vote > track: " + track);

    if (!(userName in voteScore)) {
      voteScore[userName] = 0;
    }

    if (voteScore[userName] >= voteLimitPerUser) {
      _slackMessage("Don't cheat, " + userName + "? DENIED!", channel.id);
    } else {
      if (userName in gongScore) {
        _slackMessage("Changed your mind, " + userName + "? Well, ok then...", channel.id);
      }

      voteScore[userName] = voteScore[userName] + 1;
      voteCounter++;
      _slackMessage("This is VOTE " + voteCounter + "/" + voteLimit + " for " + track, channel.id);
      if (voteCounter >= voteLimit) {
        _slackMessage("This track is now immune to GONG! (just this once)", channel.id);
        voteCounter = 0;
        voteScore = {};
        gongBanned = true;
      }
    }
  });
}

function _gongcheck(channel, userName) {
  _log("_gongcheck...");

  _currentTrackTitle(channel, function(err, track) {
    _log("_gongcheck > track: " + track);

    _slackMessage("GONG is currently " + gongCounter + "/" + gongLimit + " for " + track, channel.id);
    let gongers = Object.keys(gongScore);
    if (gongers.length > 0) {
      _slackMessage("Gonged by " + gongers.join(","), channel.id);
    }
  });
}

function _previous(input, channel) {
  if (channel.name !== adminChannel) {
    return;
  }
  sonos.previous(function(err, previous) {
    _log(err, previous);
  });
}

function _help(input, channel) {
  let message = "Current commands!\n" + "=====================\n" + "`add` _text_ : Add song to the queue and start playing if idle. Will start with a fresh queue.\n" + "`addalbum` _text_ : Add an album to the queue and start playing if idle. Will start with a fresh queue.\n" + "`bestof` : _text_ : Add topp 10 tracks by the artist\n" + "`status` : show current status of Sonos\n" + "`current` : list current track\n" + "`search` _text_ : search for a track, does NOT add it to the queue\n" + "`searchalbum` _text_ : search for an album, does NOT add it to the queue\n" + "`searchplaylist` _text_ : search for a playlist, does NOT add it to the queue\n" + "`addplaylist` _text_ : Add a playlist to the queue and start playing if idle. Will start with a fresh queue.\n" + "`append` _text_ : Append a song to the previous playlist and start playing the same list again.\n" + "`gong` : The current track is bad! " + gongLimit + " gongs will skip the track\n" + "`gongcheck` : How many gong votes there are currently, as well as who has gonged.\n" + "`vote` : The current track is great! " + voteLimit + " votes will prevent the track from being gonged\n" + "`volume` : view current volume\n" + "`list` : list current queue\n";

  if (channel.name == adminChannel) {
    message += "------ ADMIN FUNCTIONS ------\n" + "`flush` : flush the current queue\n" + "`setvolume` _number_ : sets volume\n" + "`play` : play track\n" + "`stop` : stop life\n" + "`pause` : pause life\n" + "`resume` : resume after pause\n" + "`next` : play next track\n" + "`previous` : play previous track\n" + "`shuffle` : shuffle playlist\n" + "`blacklist` : show users on blacklist\n" + "`blacklist add @username` : add `@username` to the blacklist\n" + "`blacklist del @username` : remove `@username` from the blacklist\n";
  }
  message += "========== This is Kanye South Park Commons everybody ===========\n";
  _slackMessage(message, channel.id);
}

function _play(input, channel) {
  if (channel.name !== adminChannel) {
    return;
  }
  sonos.selectQueue(function(err, result) {
    sonos.play(function(err, playing) {
      _log([err, playing]);
      if (playing) {
        _slackMessage("Sonos is already PLAYING.", channel.id);
      } else {
        _slackMessage("Sonos is now PLAYING.", channel.id);
      }
    });
  });
}

function _playInt(input, channel) {
  sonos.play(function(err, playing) {
    _log([err, playing]);
  });
}

function _stop(input, channel) {
  if (channel.name !== adminChannel) {
    return;
  }
  sonos.stop(function(err, stopped) {
    _log([err, stopped]);
    if (stopped) {
      _slackMessage("Sonos is now STOPPED.", channel.id);
    }
  });
}

function _pause(input, channel) {
  if (channel.name !== adminChannel) {
    return;
  }
  sonos.selectQueue(function(err, result) {
    sonos.pause(function(err, paused) {
      _log([err, paused]);
      _slackMessage("Sonos is now PAUSED.", channel.id);
    });
  });
}

function _resume(input, channel) {
  if (channel.name !== adminChannel) {
    return;
  }
  sonos.play(function(err, playing) {
    _log([err, playing]);
    if (playing) {
      _slackMessage("Resuming...", channel.id);
    }
  });
}

function _flush(input, channel) {
  if (channel.name !== adminChannel) {
    return;
  }
  sonos.flush(function(err, flushed) {
    _log([err, flushed]);
    if (flushed) {
      _slackMessage("Sonos queue is clear.", channel.id);
    }
  });
}

function _flushInt(input, channel) {

  sonos.flush(function(err, flushed) {
    _log([err, flushed]);
    if (flushed) {
      _slackMessage("Sonos queue is clear.", channel.id);
    }
  });
}

function _shuffle(input, channel, byPassChannelValidation) {
  if (channel.name !== adminChannel && !byPassChannelValidation) {
    return;
  }
  sonos.setPlayMode("shuffle", function(err, nexted) {
    if (err) {
      _log(err);
    } else {
      _slackMessage("Shuffling the playlist.", channel.id);
    }
  });
}

function _say(input, channel) {
  if (channel.name !== adminChannel) {
    return;
  }

  let text = input[1];
  // Replace all spaces with a _ because Sonos doesn't support spaces
  text = text.replace(/ /g, "_");

  // For supported languages see www.voicerss.org/api/documentation.aspx
  // This url just redirects to voicerss because of the specific url format for the sonos
  let url = "http://i872953.iris.fhict.nl/speech/en-us_" + encodeURIComponent(text) + ".mp3";

  sonos.queueNext(url, function(err, playing) {
    _log([err, playing]);
  });
}

function _gongPlay(channel) {
  sonos.play("spotify:track:1x1xPU5ysahIAz6iKGo8pq", function(err, playing) {
    _log([err, playing]);
  });
}

function _nextTrack(channel, byPassChannelValidation) {
  if (channel.name !== adminChannel && !byPassChannelValidation) {
    return;
  }
  sonos.next(function(err, nexted) {
    if (err) {
      _log(err);
    } else {
      _slackMessage("Playing the next track...", channel.id);
    }
  });
}

function _currentTrack(channel, cb) {
  sonos.currentTrack(function(err, track) {
    if (err) {
      _log(err);
      if (cb) {
        return cb(err, null);
      }
    } else {
      if (cb) {
        return cb(null, track);
      }
      _log(track);
      let fmin = "" + Math.floor(track.duration / 60);
      fmin = fmin.length == 2
        ? fmin
        : "0" + fmin;
      let fsec = "" + track.duration % 60;
      fsec = fsec.length == 2
        ? fsec
        : "0" + fsec;

      let pmin = "" + Math.floor(track.position / 60);
      pmin = pmin.length == 2
        ? pmin
        : "0" + pmin;
      let psec = "" + track.position % 60;
      psec = psec.length == 2
        ? psec
        : "0" + psec;

      let message = `We're blasting *${track.artist}* - *${track.title}* (${pmin}:${psec}/${fmin}:${fsec})`;
      _slackMessage(message, channel.id);
    }
  });
}

function _currentTrackTitle(channel, cb) {
  sonos.currentTrack(function(err, track) {
    let _track = "";
    if (err) {
      _log(err);
    } else {
      _track = track.title;
      _log("_currentTrackTitle > title: " + _track);
      _log("_currentTrackTitle > gongTrack: " + gongTrack);

      if (gongTrack !== "") {
        if (gongTrack !== _track) {
          _log("_currentTrackTitle > different track, reset!");
          gongCounter = 0;
          gongScore = {};
          gongBanned = false;
          voteCounter = 0;
          voteScore = {};
        } else {
          _log("_currentTrackTitle > gongTrack is equal to _track");
        }
      } else {
        _log("_currentTrackTitle > gongTrack is empty");
      }

      gongTrack = _track;
    }

    cb(err, _track);
  });
}

function _add(input, channel, userName) {
  let data = _searchSpotify(input, channel, userName, 1);
  if (!data) {
    return;
  }

  let spid = data.tracks.items[0].id;
  let uri = data.tracks.items[0].uri;
  let external_url = data.tracks.items[0].external_urls.spotify;

  let albumImg = data.tracks.items[0].album.images[2].url;
  let trackName = data.tracks.items[0].artists[0].name + " - " + data.tracks.items[0].name;

  _log("Adding track:", trackName, "with UID:", uri);

  sonos.getCurrentState(function(err, state) {
    if (err) {
      _log(err);
    } else {
      if (state === "stopped") {
        _flushInt(input, channel);
        _addToSpotify(userName, uri, albumImg, trackName, channel, function() {
          _log("Adding track:", trackName);
          // Start playing the queue automatically.
          _playInt("play", channel);
        });

      } else if (state === "playing") {
        //Add the track to playlist...
        _addToSpotify(userName, uri, albumImg, trackName, channel);
      } else if (state === "paused") {
        _addToSpotify(userName, uri, albumImg, trackName, channel, function() {
          if (channel.name === adminChannel) {
            _slackMessage("Sonos is currently PAUSED. Type `resume` to start playing...", channel.id);
          }
        });

      } else if (state === "transitioning") {
        _slackMessage("Sonos says it is 'transitioning'. We've got no idea what that means either...", channel.id);
      } else if (state === "no_media") {
        _slackMessage("Sonos reports 'no media'. Any idea what that means?", channel.id);
      } else {
        _slackMessage("Sonos reports its state as '" + state + "'. Any idea what that means? I've got nothing.", channel.id);
      }
    }
  });
}

function _addalbum(input, channel, userName) {
  let data = _searchSpotifyAlbum(input, channel, userName, 1);
  if (!data) {
    return;
  }

  let spid = data.albums.items[0].id;
  let uri = data.albums.items[0].uri;
  let external_url = data.albums.items[0].external_urls.spotify;
  let trackName = data.albums.items[0].artists[0].name + " - " + data.albums.items[0].name;
  let albumImg = data.albums.items[0].images[2].url;

  _log("Adding album:", trackName, "with UID:", uri);

  sonos.getCurrentState(function(err, state) {
    if (err) {
      _log(err);
    } else {
      if (state === "stopped") {
        _flushInt(input, channel);
        _addToSpotify(userName, uri, albumImg, trackName, channel, function() {
          _log("Adding album:", trackName);
          // Start playing the queue automatically.
          _playInt("play", channel);
        });

      } else if (state === "playing") {
        //Add the track to playlist...
        _addToSpotify(userName, uri, albumImg, trackName, channel);
      } else if (state === "paused") {
        _addToSpotify(userName, uri, albumImg, trackName, channel, function() {
          if (channel.name === adminChannel) {
            _slackMessage("Sonos is currently PAUSED. Type `resume` to start playing...", channel.id);
          }
        });

      } else if (state === "transitioning") {
        _slackMessage("Sonos says it is 'transitioning'. We've got no idea what that means either...", channel.id);
      } else if (state === "no_media") {
        _slackMessage("Sonos reports 'no media'. Any idea what that means?", channel.id);
      } else {
        _slackMessage("Sonos reports its state as '" + state + "'. Any idea what that means? I've got nothing.", channel.id);
      }
    }
  });
}

function _append(input, channel, userName) {
  let data = _searchSpotify(input, channel, userName, 1);
  if (!data) {
    return;
  }

  let spid = data.tracks.items[0].id;
  let uri = data.tracks.items[0].uri;
  let external_url = data.tracks.items[0].external_urls.spotify;

  let albumImg = data.tracks.items[0].album.images[2].url;
  let trackName = data.tracks.items[0].artists[0].name + " - " + data.tracks.items[0].name;

  sonos.getCurrentState(function(err, state) {
    if (err) {
      _log(err);
    } else {
      if (state === "stopped") {
        _addToSpotify(userName, uri, albumImg, trackName, channel, function() {
          // Start playing the queue automatically.
          _playInt("play", channel, function() {
            _log("Adding track:", trackName, function() {});
          });
        });

      } else if (state === "playing") {
        //Add the track to playlist...
        _addToSpotify(userName, uri, albumImg, trackName, channel);
      } else if (state === "paused") {
        _addToSpotify(userName, uri, albumImg, trackName, channel, function() {
          if (channel.name === adminChannel) {
            _slackMessage("Sonos is currently PAUSED. Type `resume` to start playing...", channel.id);
          }
        });

      } else if (state === "transitioning") {
        _slackMessage("Sonos says it is 'transitioning'. We've got no idea what that means either...", channel.id);
      } else if (state === "no_media") {
        _slackMessage("Sonos reports 'no media'. Any idea what that means?", channel.id);
      } else {
        _slackMessage("Sonos reports its state as '" + state + "'. Any idea what that means? I've got nothing.", channel.id);
      }
    }
  });
}

function _search(input, channel, userName) {
  let data = _searchSpotify(input, channel, userName, searchLimit);
  if (!data) {
    return;
  }

  let trackNames = [];
  for (let i = 1; i <= data.tracks.items.length; i++) {

    let spid = data.tracks.items[i - 1].id;
    let uri = data.tracks.items[i - 1].uri;
    let external_url = data.tracks.items[i - 1].external_urls.spotify;

    let albumImg = data.tracks.items[i - 1].album.images[2].url;
    let trackName = data.tracks.items[i - 1].artists[0].name + " - " + data.tracks.items[i - 1].name;

    trackNames.push(trackName);
  }

  //Print the result...
  let message = userName + ", I found the following track(s):\n```\n" + trackNames.join("\n") + "\n```\nIf you want to play it, use the `add` command..\n";

  _slackMessage(message, channel.id);
}

function _addToSpotify(userName, uri, albumImg, trackName, channel, cb) {
  _log("DEBUG addToSpotify", uri);
  sonos.queue(uri, function(err, res) {
    let message = "";
    if (!res) {
      message = "Error! No spotify account?";
      _log(err);
      return;
    }

    let queueLength = res[0].FirstTrackNumberEnqueued;
    _log("queueLength", queueLength);
    message = "Sure " + userName + ", Added \"" + trackName + "\" to the queue!\n" + albumImg + "\nPosition in queue is " + queueLength;

    _slackMessage(message, channel.id);

    if (cb) {
      cb();
    }
  });
}

function _addToSpotifyPlaylist(userName, uri, trackName, channel, cb) {

  _log("TrackName:", trackName);
  _log("URI:", uri);
  sonos.queue(uri, function(err, res) {
    let message = "";
    if (!res) {
      message = "Error! No spotify account?";
      _log(err);
      return;
    }

    let queueLength = res[0].FirstTrackNumberEnqueued;
    _log("queueLength", queueLength);
    message = "Sure " + userName + ", Added \"" + trackName + "\" to the queue!\n" + "\nPosition in queue is " + queueLength;

    _slackMessage(message, channel.id);

    if (cb) {
      cb();
    }
  });
}

function _addToSpotifyArtist(userName, spid, trackName, channel, cb) {

  _log("spid:", spid);
  _log("TrackName:", trackName);
  //    _log("URI:", uri);
  let spotifyArtist = "spotify:artistTopTracks:" + trackName;
  _log("spotifyArtist:", spotifyArtist);
  sonos.queue(spotifyArtist, function(err, res) {
    let message = "";
    if (!res) {
      message = "Error! No spotify account?";
      _log(err);
      return;
    }

    let queueLength = res[0].FirstTrackNumberEnqueued;
    _log("queueLength", queueLength);
    message = "Sure " + userName + " Added 10 most popular tracks by \"" + spid + "\" to the queue!\n" + "\nPosition in queue is " + queueLength;

    _slackMessage(message, channel.id);

    if (cb) {
      cb();
    }
  });
}

function _addplaylist(input, channel, userName) {
  let data = _searchSpotifyPlaylist(input, channel, userName, 1);
  if (!data) {
    return;
  }

  let trackNames = [];
  for (let i = 1; i <= data.playlists.items.length; i++) {
    let spid = data.playlists.items[i - 1].id;
    let uri = data.playlists.items[i - 1].uri;
    let external_url = data.playlists.items[i - 1].external_urls.spotify;
    let trackName = data.playlists.items[i - 1].name;
    trackNames.push(trackName);

  }

  sonos.getCurrentState(function(err, state) {
    if (err) {
      _log(err);
    } else {
      if (state === "stopped") {
        _flushInt(input, channel);
        _addToSpotifyPlaylist(userName, uri, trackName, channel, function() {
          _log("Adding playlist:", trackName);
          // Start playing the queue automatically.
          _playInt("play", channel);
        });

      } else if (state === "playing") {
        //Add the track to playlist...
        _addToSpotifyPlaylist(userName, uri, trackName, channel);
      } else if (state === "paused") {
        _addToSpotifyPlaylist(userName, uri, trackName, channel, function() {
          if (channel.name === adminChannel) {
            _slackMessage("Sonos is currently PAUSED. Type `resume` to start playing...", channel.id);
          }
        });

      } else if (state === "transitioning") {
        _slackMessage("Sonos says it is 'transitioning'. We've got no idea what that means either...", channel.id);
      } else if (state === "no_media") {
        _slackMessage("Sonos reports 'no media'. Any idea what that means?", channel.id);
      } else {
        _slackMessage("Sonos reports its state as '" + state + "'. Any idea what that means? I've got nothing.", channel.id);
      }
    }
  });
}

function _bestof(input, channel, userName) {
  let data = _searchSpotifyArtist(input, channel, userName, 1);
  if (!data) {
    return;
  }

  let trackNames = [];
  for (let i = 1; i <= data.artists.items.length; i++) {
    let spid = data.artists.items[i - 1].id;
    let uri = data.artists.items[i - 1].uri;
    let external_url = data.artists.items[i - 1].external_urls.spotify;
    let trackName = data.artists.items[i - 1].name;
    trackNames.push(trackName);

  }

  sonos.getCurrentState(function(err, state) {
    if (err) {
      _log(err);
    } else {
      if (state === "stopped") {
        _flushInt(input, channel);
        _addToSpotifyArtist(userName, trackName, spid, channel);
        _log("Adding artist:", trackName);
        _playInt("play", channel);

      } else if (state === "playing") {
        //Add the track to playlist...
        _addToSpotifyArtist(userName, trackName, spid, channel);
      } else if (state === "paused") {
        _addToSpotifyArtist(userName, trackName, spid, channel, function() {
          if (channel.name === adminChannel) {
            _slackMessage("Sonos is currently PAUSED. Type `resume` to start playing...", channel.id);
          }
        });

      } else if (state === "transitioning") {
        _slackMessage("Sonos says it is 'transitioning'. We've got no idea what that means either...", channel.id);
      } else if (state === "no_media") {
        _slackMessage("Sonos reports 'no media'. Any idea what that means?", channel.id);
      } else {
        _slackMessage("Sonos reports its state as '" + state + "'. Any idea what that means? I've got nothing.", channel.id);
      }
    }
  });
}

function _searchSpotify(input, channel, userName, limit) {
  let accessToken = _getAccessToken(channel.id);
  if (!accessToken) {
    return false;
  }

  let query = "";
  for (let i = 1; i < input.length; i++) {
    query += urlencode(input[i]);
    if (i < input.length - 1) {
      query += " ";
    }
  }

  let getapi = urllibsync.request("https://api.spotify.com/v1/search?q=" + query + "&type=track&limit=" + limit + "&market=" + market + "&access_token=" + accessToken);

  let data = JSON.parse(getapi.data.toString());
  _log(data);
  if (!data.tracks || !data.tracks.items || data.tracks.items.length == 0) {
    _slackMessage("Sorry " + userName + ", I could not find that track :(", channel.id);
    return;
  }

  return data;
}

function _searchSpotifyPlaylist(input, channel, userName, limit) {
  let accessToken = _getAccessToken(channel.id);
  if (!accessToken) {
    return false;
  }

  let query = "";
  for (let i = 1; i < input.length; i++) {
    query += urlencode(input[i]);
    if (i < input.length - 1) {
      query += " ";
    }
  }

  let getapi = urllibsync.request("https://api.spotify.com/v1/search?q=" + query + "&type=playlist&limit=" + limit + "&market=" + market + "&access_token=" + accessToken);

  let data = JSON.parse(getapi.data.toString());
  _log(data);
  if (!data.playlists || !data.playlists.items || data.playlists.items.length == 0) {
    _slackMessage("Sorry " + userName + ", I could not find that playlist :(", channel.id);
    return;
  }

  return data;
}

function _searchSpotifyAlbum(input, channel, userName, limit) {
  let accessToken = _getAccessToken(channel.id);
  if (!accessToken) {
    return false;
  }

  let query = "";
  for (let i = 1; i < input.length; i++) {
    query += urlencode(input[i]);
    if (i < input.length - 1) {
      query += " ";
    }
  }

  let getapi = urllibsync.request("https://api.spotify.com/v1/search?q=" + query + "&type=album&limit=" + limit + "&market=" + market + "&access_token=" + accessToken);

  let data = JSON.parse(getapi.data.toString());
  _log(data);
  if (!data.albums || !data.albums.items || data.albums.items.length == 0) {
    _slackMessage("Sorry " + userName + ", I could not find that album :(", channel.id);
    return;
  }

  return data;
}

function _searchSpotifyArtist(input, channel, userName, limit) {
  let accessToken = _getAccessToken(channel.id);
  if (!accessToken) {
    return false;
  }

  let query = "";
  for (let i = 1; i < input.length; i++) {
    query += urlencode(input[i]);
    if (i < input.length - 1) {
      query += " ";
    }
  }

  let getapi = urllibsync.request("https://api.spotify.com/v1/search?q=" + query + "&type=artist&limit=" + limit + "&market=" + market + "&access_token=" + accessToken);

  let data = JSON.parse(getapi.data.toString());
  _log(data);
  if (!data.artists || !data.artists.items || data.artists.items.length == 0) {
    _slackMessage("Sorry " + userName + ", I could not find that artist :(", channel.id);
    return;
  }

  return data;
}

function _status(channel) {
  sonos.getCurrentState(function(err, state) {
    if (err) {
      _log(err);
      return;
    }

    _slackMessage("Sonos state is '" + state + "'", channel.id);
  });
}

function _sl(channel, userName) {
  let train = "      oooOOOOOOOOOOO\"\n" + "     o   ____          :::::::::::::::::: :::::::::::::::::: __|-----|__\n" + "     Y_,_|[]| --++++++ |[][][][][][][][]| |[][][][][][][][]| |  [] []  |\n" + "    {|_|_|__|;|______|;|________________|;|________________|;|_________|;\n" + "     /oo--OO   oo  oo   oo oo      oo oo   oo oo      oo oo   oo     oo\n" + "+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+";
  _slackMessage("Just for you, " + userName + "\n```\n" + train + "\n```\n", channel.id);
}

function _searchplaylist(input, channel) {
  let accessToken = _getAccessToken(channel.id);
  if (!accessToken) {
    return false;
  }

  let query = "";
  for (let i = 1; i < input.length; i++) {
    query += urlencode(input[i]);
    if (i < input.length - 1) {
      query += " ";
    }
  }

  let getapi = urllibsync.request("https://api.spotify.com/v1/search?q=" + query + "&type=playlist&limit=3&market=" + market + "&access_token=" + accessToken);
  let data = JSON.parse(getapi.data.toString());
  console.log(data);
  if (data.playlists && data.playlists.items && data.playlists.items.length > 0) {
    let trackNames = [];

    for (let i = 1; i <= data.playlists.items.length; i++) {

      let spid = data.playlists.items[i - 1].id;
      let uri = data.playlists.items[i - 1].uri;
      let external_url = data.playlists.items[i - 1].external_urls.spotify;
      let trackName = data.playlists.items[i - 1].name;

      trackNames.push(trackName);

    }

    let message = "I found the following playlist(s):\n```\n" + trackNames.join("\n") + "\n```\nIf you want to play it, use the `addplaylist` command..\n";
    slack.sendMessage(message, channel.id);

  } else {
    slack.sendMessage("Sorry could not find that playlist :(", channel.id);
  }
}

function _searchalbum(input, channel) {
  let accessToken = _getAccessToken(channel.id);
  if (!accessToken) {
    return false;
  }

  let query = "";
  for (let i = 1; i < input.length; i++) {
    query += urlencode(input[i]);
    if (i < input.length - 1) {
      query += " ";
    }
  }

  let getapi = urllibsync.request("https://api.spotify.com/v1/search?q=" + query + "&type=album&limit=3&market=" + market + "&access_token=" + accessToken);
  let data = JSON.parse(getapi.data.toString());
  console.log(data);
  if (data.albums && data.albums.items && data.albums.items.length > 0) {
    let trackNames = [];

    for (let i = 1; i <= data.albums.items.length; i++) {

      let spid = data.albums.items[i - 1].id;
      let uri = data.albums.items[i - 1].uri;
      let external_url = data.albums.items[i - 1].external_urls.spotify;
      //           let trackName = data.albums.items[i-1].name;
      let trackName = data.albums.items[i - 1].artists[0].name + " - " + data.albums.items[i - 1].name;

      trackNames.push(trackName);

    }

    let message = "I found the following album(s):\n```\n" + trackNames.join("\n") + "\n```\nIf you want to play it, use the `addalbum` command..\n";
    slack.sendMessage(message, channel.id);

  } else {
    slack.sendMessage("Sorry could not find that album :(", channel.id);
  }
}

function _blacklist(input, channel) {
  if (channel.name !== adminChannel) {
    return;
  }

  let action = (
    (input[1])
    ? input[1]
    : "");
  let slackUser = (
    (input[2])
    ? slack.dataStore.getUserById(input[2].slice(2, -1))
    : "");

  if (input[2] != "" && typeof slackUser !== "undefined") {
    let username = "@" + slackUser.name;
  } else if (input[2] != "") {
    message = "The user " + (
    input[2]) + " is not a valid Slack user.";
  }

  if (action == "") {
    message = "The following users are blacklisted:\n```\n" + blacklist.join("\n") + "\n```";

  } else if (typeof username !== "undefined") {

    if (action == "add") {
      let i = blacklist.indexOf(username);
      if (i == -1) {
        blacklist.push(username);
        message = "The user " + username + " has been added to the blacklist.";
      } else {
        message = "The user " + username + " is already on the blacklist.";
      }

    } else if (action == "del") {
      let i = blacklist.indexOf(username);
      if (i != -1) {
        blacklist.splice(i, 1);
        message = "The user " + username + " has been removed from the blacklist.";
      } else {
        message = "The user " + username + " is not on the blacklist.";
      }

    } else {
      message = "Usage: `blacklist add|del @username`";
    }
  }
  _slackMessage(message, channel.id);
}

function _getAccessToken(channelid) {
  if (apiKey === "") {
    _slackMessage("You did not set up an API key. Naughty.", channelid);
    return false;
  }

  let getToken = urllibsync.request("https://accounts.spotify.com/api/token", {
    method: "POST",
    data: {
      "grant_type": "client_credentials"
    },
    headers: {
      "Authorization": "Basic " + apiKey
    }
  });
  let tokendata = JSON.parse(getToken.data.toString());
  return tokendata.access_token;
}

// Playing with Travis.
// Just something that will return a value

module.exports = function(number, locale) {
  return number.toLocaleString(locale);
};
