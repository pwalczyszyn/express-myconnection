module.exports = function (pool) {
    return function (req, res, next) {
        pool.getConnection(function (err, connection) {
            if (err) return next(err);
            req.connection = connection;
            next();
        });

        var end = res.end;
        res.end = function (data, encoding) {
            if (req.connection) req.connection.release();
            res.end = end;
            res.end(data, encoding);
        }
    }
}