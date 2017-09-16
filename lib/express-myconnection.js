var _mysql,
    _dbConfig,
    _connection, // This is used as a singleton in a single connection strategy
    _pool; // Pool singleton

/**
 * Handling connection disconnects, as defined here: https://github.com/felixge/node-mysql
 */
function handleDisconnect() {
    _connection = _mysql.createConnection(_dbConfig);

    _connection.connect(function (err) {
        if (err) {
            console.log('error when connecting to db:', err);
            setTimeout(handleDisconnect, 2000);
        }
    });

    _connection.on('error', function (err) {
        console.log('db error', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect();
        } else {
            throw err;
        }
    });
}

/**
 * Returns middleware that will handle mysql db connections
 *
 * @param {Object} mysql - mysql module
 * @param {Object} dbConfig - object with mysql db options
 * @param {String} or undefined strategy - default is single strategy
 * @return {Function}
 * @api public
 */
module.exports = function (mysql, dbConfig, strategy) {

    if (null == mysql) throw new Error('Missing mysql module param!');
    if (null == dbConfig) throw new Error('Missing dbConfig module param!');
    if (null == strategy) strategy = 'single';

    // Setting _mysql module ref
    _mysql = mysql;

    // Setting _dbConfig ref
    _dbConfig = dbConfig;

    // Configuring strategies
    switch (strategy) {
        case 'single':
            // Creating single connection instance
            _connection = _mysql.createConnection(dbConfig);
            handleDisconnect(dbConfig);
            break;
        case 'pool':
            // Creating pool instance
            _pool = _mysql.createPool(dbConfig);
            break;
        case 'request':
            // Nothing at this point do be done
            break;
        default:
            throw new Error('Not supported connection strategy!');
    }

    return function (req, res, next) {
        var poolConnection,
            requestConnection;
            releaseFlag;

        switch (strategy) {
            case 'single':
                // getConnection will return singleton connection
                req.getConnection = function (callback) {
                    callback(null, _connection);
                }
                break;

            case 'pool':
                // getConnection handled by mysql pool
                req.getConnection = function (callback) {
                    // Returning cached connection from a pool, caching is on request level
                    if (poolConnection) return callback(null, poolConnection);
                    // Getting connection from a pool
                    _pool.getConnection(function (err, connection) {
                        if (err) return callback(err);
                        poolConnection = connection;
                        releaseFlag = false;
                        callback(null, poolConnection);
                    });
                };
                req.releaseConnection = function() {
                    if (poolConnection) {
                        poolConnection.release();
                        poolConnection = null;
                        releaseFlag = true;
                    }
                };
                break;

            case 'request':
                // getConnection creates new connection per request
                req.getConnection = function (callback) {
                    // Returning cached connection, caching is on request level
                    if (requestConnection) return callback(null, requestConnection);
                    // Creating new connection
                    var connection = _mysql.createConnection(dbConfig);
                    connection.connect(function (err) {
                        if (err) return callback(err);
                        requestConnection = connection;
                        callback(null, requestConnection);
                    });
                }
                break;
        }
        res.on('close', function() {
            // Ending request connection if available
            if (requestConnection) requestConnection.end();

            // Releasing pool connection if available
            if (poolConnection && !releaseFlag) poolConnection.release();
        });
        res.on('finish', function() {
            // Ending request connection if available
            if (requestConnection) requestConnection.end();

            // Releasing pool connection if available
            if (poolConnection && !releaseFlag) poolConnection.release();
        });
        next();
    }
}
