var sqlite3 = require('sqlite3').verbose();

const DATABASE_FILE = "app.sqlite";
class AppDB {
    constructor () {
        this.db = new sqlite3.Database(DATABASE_FILE);
    }

    _log(error) {
        if(error) {
            console.log(error);
        }
    }

    insertUser(username, hashed, cb=this._log) {
        this.db.run('INSERT INTO users(username, password) VALUES (?, ?)',
            [username, hashed],
            (error) => cb(error)
        )
    }

    execute(statement, values, cb=this._log) {
        this.db.run(statement, values, (error) => cb(error))
    }

    fetchOne(statement, values, cb=this._log) {
        this.db.get(statement, values, (error, row) => cb(error, row))
    }
    fetchAll(statement, values, cb=this._log) {
        this.db.all(statement, values, (error, rows) => cb(error, rows))
    }
}

module.exports = AppDB;
