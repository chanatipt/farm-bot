/********************/
/* import libraries */
/********************/
const https = require("https")
const express = require("express")
const mqtt = require('mqtt');
const dotenv = require('dotenv')
const app = express()
const path = require('path');

/************************/
/* process environments */
/************************/
dotenv.config()
const PORT = process.env.PORT || 3000
const TOKEN = process.env.LINE_ACCESS_TOKEN
const FEEDS = process.env.FEEDS.split(", ")
const MQTT_SERVER = process.env.MQTT_SERVER
const MQTT_PORT = process.env.MQTT_PORT
const MQTT_USER = process.env.MQTT_USER
const MQTT_PASSWORD = process.env.MQTT_PASSWORD
const TO_CONTR_TOPIC = process.env.TO_CONTR_TOPIC
const FROM_CONTR_TOPIC = process.env.FROM_CONTR_TOPIC
const LINE_HOSTNAME = process.env.LINE_HOSTNAME
const LINE_PATH = process.env.LINE_PATH
const MY_HOSTNAME = process.env.MY_HOSTNAME
const headers = {
  "Content-Type": "application/json",
  "Authorization": "Bearer " + TOKEN
}
let schedule = []

/******************/
/* MQTT functions */
/******************/
// MQTT connection
const client = mqtt.connect({
  host: MQTT_SERVER,
  port: MQTT_PORT,
  username: MQTT_USER,
  password: MQTT_PASSWORD
});
// Topic Subscription
client.on('connect', function () {
  console.log("MQTT Connect");
  client.subscribe(FROM_CONTR_TOPIC, function (err) {
      if (err) {
          console.log(err);
      }
  });
});
// Message Receipt
client.on('message', function (topic, message) {
  keywords = message.toString().split('---');
  keyword = keywords[0]
  replyToken = keywords[1]
  message_txt = ''

  if(keyword === 'r0') {
    message_txt = 'ไม่ได้เปิดระบบอยู่'
  } else if(keyword.substring(0, 2) === 'r1') {
    message_txt = 'เปิดระบบอยู่\n'
    fkeyword = keyword.substr(3)
    sub_keyword = fkeyword.split('/')
    for(i=0;i<sub_keyword.length;i++) {
      if(i<FEEDS.length) {
        if(sub_keyword[i] === 'f'+(i+1)+'0') {
          message_txt += i+1 + ') ไม่ได้รด' + FEEDS[i] + 'อยู่\n'
        } else if (sub_keyword[i] === 'f'+(i+1)+'1') {
          message_txt += i+1 + ') กำลังรด' + FEEDS[i] + 'อยู่\n'
        }
      }
    }
  } else if(keyword === 'sys1') {
    message_txt = 'ได้เปิดระบบเรียบร้อย'
  } else if(keyword === 'sys0') {
    message_txt = 'ได้ปิดระบบเรียบร้อย'
  } else if(keyword.substring(0, 3) === 'act') {
    sub_keyword = keyword.split('act')
    channel = sub_keyword[1]
    message_txt = 'เริ่มรด' + FEEDS[channel] + 'แล้ว'
  } else if(keyword.substring(0, 3) === 'dis') {
    sub_keyword = keyword.split('dis')
    channel = sub_keyword[1]
    message_txt = 'หยุดรด' + FEEDS[channel] + 'แล้ว'
  } else if(keyword.substring(0, 3) === 'sch') {
    if(keyword === 'sch,') {
      message_txt = 'ยังไม่มีตารางรดน้ำ'
    } else {
      message_txt = 'ตารางรดน้ำ\n'
      skeyword = keyword.substr(4)
      sub_keyword = skeyword.split('/')
      cnt = 0
      for(i=0;i<sub_keyword.length;i++) {
        sch = sub_keyword[i].split('@')
        ch = sch[0] - 1
        if((ch >= 0) && (ch < FEEDS.length)) {
          message_txt += (cnt+1) + ') '+ FEEDS[ch] + ' เริ่มรดเวลา ' + sch[1] + ' ระยะเวลา ' + sch[2] + ' วินาที\n'
          cnt++
        }
      }
    }
  } else if(keyword.substring(0, 4) === 'list') {
    if(keyword === 'list,') {
      message_txt = 'ยังไม่มีตารางรดน้ำ'
    } else {
      skeyword = keyword.substr(5)
      sub_keyword = skeyword.split('/')
      cnt = 0
      schedule = []
      for(i=0;i<sub_keyword.length;i++) {
        sch = sub_keyword[i].split('@')
        ch = sch[0] - 1
        if((ch >= 0) && (ch < FEEDS.length)) {
          schedule.push([cnt+1, ch, FEEDS[ch], sch[1], sch[2]])
          cnt++
        }
      }
      message_txt = `โปรดเลือกลบรายการใน link นี้ https://liff.line.me/2000256743-2myzGVdn/delete`
    }
  }

  if(message_txt != '') {
    const dataString = JSON.stringify({
      replyToken: replyToken,
      messages: [
        {
          type: `text`,
          text: message_txt,
        }
      ]
    })

    // Formulate webhook https Options
    const webhookOptions = {
      "hostname": LINE_HOSTNAME,
      "path": LINE_PATH,
      "method": "POST",
      "headers": headers,
      "body": dataString
    }

    // Answer via https request
    const request = https.request(webhookOptions, (res) => {
      res.on("data", (d) => {
        process.stdout.write(d)
      })
    })
    request.on("error", (err) => {
      console.error(err)
    })
    request.write(dataString)
    request.end()
  
  }
});

/******************/
/* HTTP functions */
/******************/
app.use(express.json())
app.use(express.urlencoded({
  extended: true
}))
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// main GET / function
app.get("/", (req, res) => {
  res.render(path.join(__dirname, 'views/index.ejs'),)
})

// main GET /input function
app.get("/input", (req, res) => {
  res.render(path.join(__dirname, 'views/input.ejs'),  {feeds:FEEDS})
})

// main GET /delete function
app.get("/delete", (req, res) => {
  res.render(path.join(__dirname, 'views/delete.ejs'),  {schedule:schedule})
})

app.get("/complete", function(req, res) {
  res.render(path.join(__dirname, 'views/complete.ejs'))

})

app.post("/delete", function(req, res) {
  const sch  = req.body.schedule
  message = "del"
  for(i=0;i<sch.length;i++) {
    if(i>0) {
      message += '/'
    }
    message += (schedule[sch[i]][1]+1) + "@" +schedule[sch[i]][3] + "@" + schedule[sch[i]][4]
  }
  message +=  "---" + "empty-value"
  client.publish(TO_CONTR_TOPIC, message);
  res.redirect('/complete')
})

app.post("/input", function(req, res) {
  const {zone, starttime, duration } = req.body
  message = "add" + zone + "@" +starttime + "@" + duration + "---" + "empty-value"
  client.publish(TO_CONTR_TOPIC, message);
  res.redirect('/complete')
})

// main POST /webhook function
app.post("/webhook", function(req, res) {
  if (req && 
      req.body && 
      req.body.events && 
      req.body.events[0] && 
      req.body.events[0].type) {
    if (req.body.events[0].type === "message") {
      const incoming_txt = req.body.events[0].message.text
      console.log(incoming_txt)
      if(incoming_txt == 'รดน้ำ') {
        feedOnResponse(req, res)
      } else if(incoming_txt == 'หยุดรดน้ำ') {
        feedOffResponse(req, res)
      } else if(incoming_txt == 'จัดการตารางรดน้ำ') {
        manageScheduleResponse(req, res)
      } else if(incoming_txt == 'ดูตารางรดน้ำ') {
        getScheduleResponse(req, res)
      } else if(incoming_txt == 'เพิ่มรายการ') {
        addScheduleResponse(req, res)
      } else if(incoming_txt == 'ลบรายการ') {
        deleteScheduleResponse(req, res)
      } else if(incoming_txt == 'สถานะ') {
        getReportResponse(req, res)
      } else if(incoming_txt == 'เปิดระบบ') {
        systemOnResponse(req, res)
      } else if(incoming_txt == 'ปิดระบบ') {
        systemOffResponse(req, res)
      } else if(incoming_txt.substring(0,6) == 'FeedOn') {
        feedOnInxResponse(req, res, incoming_txt)
      } else if(incoming_txt.substring(0,7) == 'FeedOff') {
        feedOffInxResponse(req, res, incoming_txt)
      }
    }      
  }
  res.sendStatus(200)
})

app.listen(PORT, () => {
  console.log(`web services listening at http://localhost:${PORT}`)
})

/*******************************/
/* Line API Response Functions */
/*******************************/
function feedOnResponse(req, res) {
  const replyToken = req.body.events[0].replyToken

  // populate feed items for quick reply menu
  const feed_items = FEEDS.map((feed, inx) => {
    var obj = {
        type: "action",
        action: {
          type: "message",
          label: feed,
          text: "FeedOn" + (inx+1) ,
        }
    };
    return obj
  })

  // generate line JSON quick reply body message
  const dataString = JSON.stringify({
    replyToken: replyToken,
    messages: [
      {
        type: `text`,
        text: `ต้องการรดน้ำจุดไหน?`,
        quickReply: {
          items: feed_items
        }
      }
    ]
  })

  // Formulate webhook https Options
  const webhookOptions = {
    "hostname": LINE_HOSTNAME,
    "path": LINE_PATH,
    "method": "POST",
    "headers": headers,
    "body": dataString
  }

  // Answer via https request
  const request = https.request(webhookOptions, (res) => {
    res.on("data", (d) => {
      process.stdout.write(d)
    })
  })
  request.on("error", (err) => {
    console.error(err)
  })
  request.write(dataString)
  request.end()
}

function feedOffResponse(req, res) {
  const replyToken = req.body.events[0].replyToken

  // populate feed items for quick reply menu
  const feed_items = FEEDS.map((feed, inx) => {
  var obj = {
      type: "action",
      action: {
        type: "message",
        label: feed,
        text: "FeedOff" + (inx+1) ,
      }
    };
    return obj
  })

  // generate line JSON quick reply body message
  const dataString = JSON.stringify({
  replyToken: replyToken,
  messages: [
      {
        type: `text`,
        text: `ต้องการหยุดรดน้ำจุดไหน?`,
        quickReply: {
          items: feed_items
        }
      }
    ]
  })

  // Formulate webhook https Options
  const webhookOptions = {
    "hostname": LINE_HOSTNAME,
    "path": LINE_PATH,
    "method": "POST",
    "headers": headers,
    "body": dataString
  }

  // Answer via https request
  const request = https.request(webhookOptions, (res) => {
    res.on("data", (d) => {
      process.stdout.write(d)
    })
  })
  request.on("error", (err) => {
    console.error(err)
  })
  request.write(dataString)
  request.end()
}

function manageScheduleResponse(req, res) {
  const replyToken = req.body.events[0].replyToken

  // populate items for quick reply menu
  const sch_menu = ['ดูตารางรดน้ำ', 'เพิ่มรายการ', 'ลบรายการ']
  const items = sch_menu.map((menu, inx) => {
    var obj = {
        type: "action",
        action: {
          type: "message",
          label: menu,
          text: menu,
        }
      };
    return obj
  })
  
  // generate line JSON quick reply body message
  const dataString = JSON.stringify({
  replyToken: replyToken,
  messages: [
      {
        type: `text`,
        text: `ต้องการจัดการตารางรดน้ำอย่างไร?`,
        quickReply: {
          items: items
        }
      }
    ]
  })

  // Formulate webhook https Options
  const webhookOptions = {
    "hostname": LINE_HOSTNAME,
    "path": LINE_PATH,
    "method": "POST",
    "headers": headers,
    "body": dataString
  }

  // Answer via https request
  const request = https.request(webhookOptions, (res) => {
    res.on("data", (d) => {
      process.stdout.write(d)
    })
  })
  request.on("error", (err) => {
    console.error(err)
  })
  request.write(dataString)
  request.end()

}

function getReportResponse(req, res) {
  const replyToken = req.body.events[0].replyToken
  
  client.publish(TO_CONTR_TOPIC, "Report" + "---" + replyToken);
}

function systemOnResponse(req, res) {
  const replyToken = req.body.events[0].replyToken

  client.publish(TO_CONTR_TOPIC, "SystemOn" + "---" + replyToken);
}

function systemOffResponse(req, res) {
  const replyToken = req.body.events[0].replyToken

  client.publish(TO_CONTR_TOPIC, "SystemOff" + "---" + replyToken);
}

function feedOnInxResponse(req, res, incoming_txt) {
  const feedStr = incoming_txt.split('FeedOn')
  const feedInx = feedStr[1] - 1
  const replyToken = req.body.events[0].replyToken

  if((feedInx >= 0) && (feedInx < FEEDS.length)) {
      client.publish(TO_CONTR_TOPIC, "FeedOn" + (feedInx+1) + "---" + replyToken);
  }
}

function feedOffInxResponse(req, res, incoming_txt) {
  const feedStr = incoming_txt.split('FeedOff')
  const feedInx = feedStr[1] - 1
  const replyToken = req.body.events[0].replyToken

  if((feedInx >= 0) && (feedInx < FEEDS.length)) {
        client.publish(TO_CONTR_TOPIC, "FeedOff" + (feedInx+1) + "---" + replyToken);
  }
}

function getScheduleResponse(req, res) {
  const replyToken = req.body.events[0].replyToken

  client.publish(TO_CONTR_TOPIC, "Schedule" + "---" + replyToken);

}

function addScheduleResponse(req, res) {
  const replyToken = req.body.events[0].replyToken

  // generate line JSON quick reply body message
  const dataString = JSON.stringify({
    replyToken: replyToken,
    messages: [
        {
          type: `text`,
          text: `โปรดระบุรายละเอียดใน link นี้ https://liff.line.me/2000256743-2myzGVdn/input`,
        }
      ]
    })
  
    // Formulate webhook https Options
    const webhookOptions = {
      "hostname": LINE_HOSTNAME,
      "path": LINE_PATH,
      "method": "POST",
      "headers": headers,
      "body": dataString
    }
  
    // Answer via https request
    const request = https.request(webhookOptions, (res) => {
      res.on("data", (d) => {
        process.stdout.write(d)
      })
    })
    request.on("error", (err) => {
      console.error(err)
    })
    request.write(dataString)
    request.end()
}


function deleteScheduleResponse(req, res) {
  const replyToken = req.body.events[0].replyToken

  client.publish(TO_CONTR_TOPIC, "list" + "---" + replyToken);

}