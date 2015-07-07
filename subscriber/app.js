var async = require('async');
var express = require('express');
var hbs = require('express-handlebars');
var bodyParser = require('body-parser');
var r = require('rethinkdb');

var config = require('./config.js');

var app = express();

app.set('views', __dirname + '/views');
app.engine('hbs', hbs({
  defaultLayout: 'main',
  extname: '.hbs',
  layoutsDir: __dirname + '/views'
}));
app.set('view engine', 'hbs');

//app.use(bodyParser.text({ type: 'text/html' }));

// create application/json parser
var jsonParser = bodyParser.json()

// create application/x-www-form-urlencoded parser
var urlencodedParser = bodyParser.urlencoded({extended: false})


app.route('/')
    .get(orders)
    .post(urlencodedParser, placeOrder);

app.route('/order/:id')
    .get(deleteOrder);

//If we reach this middleware the route could not be handled and must be unknown.
app.use(handle404);

//Generic error handling middleware.
app.use(handleError);

/*
 * Page-not-found middleware.
 */
function handle404(req, res, next) {
  res.status(404).end('not found');
}
/*
 * Generic error handling middleware.
 * Send back a 500 page and log the error to the console.
 */
function handleError(err, req, res, next) {
  console.error(err.stack);
  res.status(500).json({err: err.message});
}

function startExpress(connection) {
  app._rdbConn = connection;
  app.listen(config.express.port);
  console.log('Listening on port ' + config.express.port);
}


function orders(req, res, next) {
  r.table('orders').orderBy({index: 'createdAt'}).run(req.app._rdbConn, function (err, cursor) {
    if (err) {
      return next(err);
    }

    //Retrieve all the orders in an array.
    cursor.toArray(function (err, result) {
      if (err) {
        return next(err);
      }
      res.render('home', {title: 'Orders', orders: result});
    });
  });
}

function placeOrder(req, res, next) {

  var orderItem = {name: req.body.name, quantity: req.body.quantity, createdAt: r.now()} || {};

  console.dir(orderItem);

  r.table('orders').insert(orderItem, {returnChanges: true}).run(req.app._rdbConn, function (err, result) {
    if (err) {
      return next(err);
    }
    res.redirect('/');
  });
}

function deleteOrder(req, res, next) {

  var orderItemId = req.params.id;
  console.log(orderItemId);

  r.table('orders').get(orderItemId).delete().run(req.app._rdbConn, function(err, result) {
    if(err) {
      return next(err);
    }

    res.redirect('/');
  });
}


/*
 * Connect to rethinkdb, create the needed tables/indexes and then start express.
 * Create tables/indexes then start express
 */
async.waterfall([
  function connect(callback) {
    r.connect(config.rethinkdb, callback);
  },
  function createDatabase(connection, callback) {
    //Create the database if needed.
    r.dbList().contains(config.rethinkdb.db).do(function (containsDb) {
      return r.branch(
          containsDb,
          {created: 0},
          r.dbCreate(config.rethinkdb.db)
      );
    }).run(connection, function (err) {
      callback(err, connection);
    });
  },
  function createTable(connection, callback) {
    //Create the table if needed.
    r.tableList().contains('orders').do(function (containsTable) {
      return r.branch(
          containsTable,
          {created: 0},
          r.tableCreate('orders')
      );
    }).run(connection, function (err) {
      callback(err, connection);
    });
  },
  function createIndex(connection, callback) {
    //Create the index if needed.
    r.table('orders').indexList().contains('createdAt').do(function (hasIndex) {
      return r.branch(
          hasIndex,
          {created: 0},
          r.table('orders').indexCreate('createdAt')
      );
    }).run(connection, function (err) {
      callback(err, connection);
    });
  },
  function waitForIndex(connection, callback) {
    //Wait for the index to be ready.
    r.table('orders').indexWait('createdAt').run(connection, function (err, result) {
      callback(err, connection);
    });
  }
], function (err, connection) {
  if (err) {
    console.error(err);
    process.exit(1);
    return;
  }

  startExpress(connection);
});
