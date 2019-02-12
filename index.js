const dotenv = require('dotenv').config();
const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const cookie = require('cookie');
const nonce = require('nonce')();
const querystring = require('querystring');
const request = require('request-promise');
const cron = require("node-cron");

const apiKey = process.env.SHOPIFY_API_KEY;
const apiPass = process.env.SHOPIFY_API_PASSWORD;
const apiSecret = process.env.SHOPIFY_API_SECRET;
const scopes = [
  'read_products',
  'read_orders',
  'write_orders'
];
const forwardingAddress = "https://6873b64a.ngrok.io";

//View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
//Body Parser Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));


app.get('/', (req, res) => {
  res.render('home');
});

app.post('/webhook', (req, res) => {
  const locationId = 14730068050;
  const headers = req.headers;
  const shop = headers['x-shopify-shop-domain'];
  const body = req.body;

  if(body){
    res.sendStatus(200);
    console.log('response 200 sent');
    let id = body.id;
    let price = body.total_price;
    let items = body.line_items;
    let responseString ="";
    items.forEach((item)=>{
      responseString+= " " + item.name;
    });

    console.log('Order ' + id +' is worth ' + price + ' and includes' + responseString);;

    /*const accessTokenRequestUrl = 'https://' + shop + '/admin/oauth/access_token';
    const accessTokenPayload = {
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    };*/
    const authString = apiKey + ':' + apiPass;
    const encodedAuth = Buffer.from(authString).toString('base64');
    const headerAuth = 'Basic ' + encodedAuth;
    const shopInventoryUrl = 'https://' + shop + '/admin/inventory_levels/adjust.json';
    //request token
    /*request.post(accessTokenRequestUrl, { json: accessTokenPayload })
    .then((accessTokenResponse) => {
      const accessToken = accessTokenResponse.access_token;
      const shopInventoryUrl = 'https://' + shop + '/admin/inventory_levels/adjust.json';
      const shopRequestHeaders = {
      'X-Shopify-Access-Token': accessToken,
    };
    //insert request here
  })*/
    //make post request to adjust inventory
    let options = {
      method: 'POST',
      uri: shopInventoryUrl,
      body: {
        "location_id": 14730068050,
        "inventory_item_id": 22017451032658,
        "available_adjustment": 5
      },
      json: true,
      headers: {
        Authorization: headerAuth,
        'Content-Type': 'application/json'
      }
    };
    request(options, function (error, response, body) {
      if (error) throw new Error(error);

      console.log(body);
      });
    /*request.post(shopInventoryUrl, options)
    .then((parsedBody) => {
      let keys = Object.keys(parsedBody);
      console.log('success');
    }).catch((err) => {
      console.log('fail');
      console.log(err);
    })*/

  } else {
    console.log("failed");
  }
});

app.get('/shopify', (req, res) => {
  const shop = req.query.shop;
  if (shop) {
    const state = nonce();
    const redirectUri = forwardingAddress + '/shopify/callback';
    const installUrl = 'https://' + shop +
      '/admin/oauth/authorize?client_id=' + apiKey +
      '&scope=' + scopes +
      '&state=' + state +
      '&redirect_uri=' + redirectUri;

    res.cookie('state', state);
    res.redirect(installUrl);
  } else {
    return res.status(400).send('Missing shop parameter. Please add ?shop=your-development-shop.myshopify.com to your request');
  }
});

app.get('/shopify/callback', (req, res) => {
  const { shop, hmac, code, state } = req.query;
  const stateCookie = cookie.parse(req.headers.cookie).state;

  if (state !== stateCookie) {
    return res.status(403).send('Request origin cannot be verified');
  }

  if (shop && hmac && code) {
    const map = Object.assign({}, req.query);
    delete map['signature'];
    delete map['hmac'];
    const message = querystring.stringify(map);
    const providedHmac = Buffer.from(hmac, 'utf-8');
    const generatedHash = Buffer.from(
      crypto
        .createHmac('sha256', apiSecret)
        .update(message)
        .digest('hex'),
        'utf-8'
      );
let hashEquals = false;
// timingSafeEqual will prevent any timing attacks. Arguments must be buffers
try {
  hashEquals = crypto.timingSafeEqual(generatedHash, providedHmac)
// timingSafeEqual will return an error if the input buffers are not the same length.
} catch (e) {
  hashEquals = false;
};

if (!hashEquals) {
  return res.status(400).send('HMAC validation failed');
}

const accessTokenRequestUrl = 'https://' + shop + '/admin/oauth/access_token';
const accessTokenPayload = {
  client_id: apiKey,
  client_secret: apiSecret,
  code,
};

request.post(accessTokenRequestUrl, { json: accessTokenPayload })
.then((accessTokenResponse) => {
  const accessToken = accessTokenResponse.access_token;

  const shopRequestUrl = 'https://' + shop + '/admin/shop.json';
  const shopEventsUrl = 'https://' + shop + '/admin/events.json';
  const shopLocationsUrl = 'https://' + shop + '/admin/locations.json';
  const shopRequestHeaders = {
  'X-Shopify-Access-Token': accessToken,
};

let eventList = [];
let renderVars = {};
request.get(shopRequestUrl, { headers: shopRequestHeaders })
.then((shopInfoResponse) => {
    let response = JSON.parse(shopInfoResponse);
    renderVars.shop_name = response.shop.name;
    renderVars.shop_owner = response.shop.shop_owner;
})
.then(
  request.get(shopEventsUrl, { headers: shopRequestHeaders })
  .then((shopEventsResponse) => {
    //res.end(shopResponse);
    let response = JSON.parse(shopEventsResponse);
    renderVars.ordersList =[];
    for(event in response.events){
      if(response.events[event].subject_type == "Order"){
        renderVars.ordersList[event] =
        {
          "verb": response.events[event].verb,
          "message": response.events[event].message
        }
      }
    }
    res.render('home', renderVars);
  })
).catch((error) => {
            res.status(error.statusCode).send(error.error.error_description);
          })
}
)
.catch((error) => {
  res.status(error.statusCode).send(error.error.error_description);
})
} else {
    res.status(400).send('Required parameters missing');
  }
});

app.listen(3000, () => {
  console.log('Example app listening on port 3000!');
});
