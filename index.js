var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var log = console.log;
var request = require('request');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

function getMessage(event)
{
  var item = event.item;
  var latest = item.ts;

  request.post({
      url: 'https://slack.com/api/channels.history',
      form: {
        'token': process.env.TOKEN,
        'channel': item.channel,
        'latest': latest,
        'inclusive': true,
        'count': 1
      }
    },
    function(err, httpResponse, body){ 
      var body = JSON.parse(body);
      var message = null;

      if (body.ok) {
        for (var i = 0; i < body.messages.length; i++) {
          if (body.messages[i].user == event.item_user && body.messages[i].ts == item.ts) {
            message = body.messages[i];
            break;
          }
        }

        if (message) {
          var text = message.text;
          var reporter = event.user;
          log('reporter: ', reporter);
          var owner = message.user;

          findDirectMessageId(text, reporter, owner);
        }
      }
    });
}

function postMessageToChannel(text)
{
  request.post({
      url: 'https://slack.com/api/chat.postMessage',
      form: {
        token: process.env.BOT_TOKEN,
        text: text,
        channel: '#lkgt',
        username: 'The Media Bot'
      }
    },
    function(err, httpResponse, body){
      if (err) {
        log('error ', err);
      }
    });

}

function findDirectMessageId(text, reporter, owner)
{
  request.post({
      url: 'https://slack.com/api/im.open',
      form: {
        token: process.env.BOT_TOKEN,
        user: reporter
      }
    },
    function (err, httpResponse, body) {
      var body = JSON.parse(body);
      var reporterDm = body.channel.id;

      sendDirectMessage(text, reporter, owner, reporterDm);
    });
}

function sendDirectMessage(text, reporter, owner = null, reporterDm) 
{
  log('text: ', text, 'reporter ', reporter, 'owner ', owner, 'reporterDm ', reporterDm);
  request.post({
      url: 'https://slack.com/api/chat.postMessage',
      form: {
        token: process.env.BOT_TOKEN,
        text: 'Hi <@' + reporter + '>, you marked the resource `'+ text +'` as recommendable. What audience would you recommend the resource to?',
        channel: reporterDm,
        username: 'The Media Bot'
      }
    },
    function(err, httpResponse, body){
      if (err) {
        log('error ', err);
      }
    });
}

function sendConfirmationMessage(text, reporterDm) 
{
  request.post({
      url: 'https://slack.com/api/chat.postMessage',
      form: {
        token: process.env.BOT_TOKEN,
        text: 'I\'m going to tag this article with *Recommended Audience:* `' + text + '`. Is that okay?',
        channel: reporterDm,
        username: 'The Media Bot'
      }
    },
    function(err, httpResponse, body){
      if (err) {
        log('error ', err);
      }
    });
}

function getFourLatestMessages(reporterDm) {
  request.post({
      url: 'https://slack.com/api/im.history',
      form: {
        token: process.env.BOT_TOKEN,
        channel: reporterDm,
        count: 4
      }
    },
    function(err, httpResponse, body){
      var body = JSON.parse(body);
      
      if (body.ok) {
        var messages = body.messages;
        
        if (messages.length === 4) {
          if (messages[1].subtype && messages[1].subtype === 'bot_message' && messages[3].subtype && messages[3].subtype === 'bot_message') {
            
            var audience = messages[2].text;
            var expression = /[-a-zA-Z0-9@:%_\+.~#?&//=]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/gi;
            var regex = new RegExp(expression);
            var t = messages[3].text;
            var url = t.match(regex);
            
            if (url) {
              url = url[0];
              postMessageToChannel("*Resource:* " + url + " \n *Audience:* `" + audience + "`");
            }
          }
        }
      }
      if (err) {
        log('error ', err);
      }
    });
}

app.get('/', function (req, res) {
   res.send('hello world');
});

app.post('/slack/auth', function(req, res){
  log('receiving token');
  log('token: ', req.body.access_token);
  log('bot token: ', req.body.bot.bot_access_token);
});

app.get('/slack/auth', function (req, res) {
  log('receiving code');
  log(req.query.code);

  request.post({
      url: 'https://slack.com/api/oauth.access',
      form: {
        code: req.query.code,
        client_id: '65743207921.231877010403',
        client_secret: process.env.client_secret,
        redirect_uri: 'https://lmedia.herokuapp.com/slack/auth'
      }
    },
    function(err, httpResponse, body){
      if (err) {
        log('error ', err);
      }
    });

});

app.post('/slack/reaction', function (req, res, next) {
  log(req.body);
  if (req.body.event.type === 'message') {
    if (req.body.event.text) {
      if (req.body.event.user) {
        if (req.body.event.text.toLowerCase() == 'yes') {
          getFourLatestMessages(req.body.event.channel);
        } else {
          var text = req.body.event.text;
          var reporterDm = req.body.event.channel;

          sendConfirmationMessage(text, reporterDm);
        }
      }
    }
  }

  if (req.body.event.reaction) {
    if (req.body.event.reaction === 'grinning') {
      getMessage(req.body.event);
    }
  }
  
  if (req.body.challenge) {
    res.send(req.body.challenge);
  } else {
    res.status(200).send('OK');
  }
});

app.listen(process.env.PORT || 8000);
