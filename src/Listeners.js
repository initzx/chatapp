const bcrypt = require('bcrypt');
const AppDB = require('./Database');
const {getUserFromToken, getSocket, addUser} = require('./Tokens');

const db = new AppDB();

class BaseSocketListener {

    constructor(type) {
        this.type = type;
    }

    init(socket) {
        this.socket = socket;
        this.socket.on(this.type, (msg) => this.listen(msg));
    }

    listen(msg) {
        console.log("Message: "+msg);
    }

    emit(msg) {
        this.socket.emit(this.type, msg);
    }
}

class MessageListener extends BaseSocketListener {
    constructor() {
        super('chat_message');
    }

    listen(msg) {
        console.log('New message: '+msg);
        this.emit(msg);
    }
}

class DisconnectListener extends BaseSocketListener {
    constructor() {
        super('disconnect');
    }

    listen(msg) {
        console.log(msg);
    }
}

class AuthenticateListener extends BaseSocketListener {
    constructor(handler) {
        super('auth');
        this.handler = handler;
    }

    _authenticate(username, password, cb) {
        db.fetchOne('SELECT id, password FROM users WHERE username = ?', [username],
            (err, row) => {
                if (err) {
                    cb(false, 'Database error!');
                    return;
                }

                if (!row) {
                    cb(false, 'User not found!');
                    return;
                }

                bcrypt.compare(password, row.password, (err, res) => {
                    if (res) {
                        cb(true, 'Success', row.id);
                    } else {
                        cb(false, 'Credentials do not match!');
                    }
                });
            }
        );
    }

    _authenticateToken(token, cb) {
        let userId = getUserFromToken(token);
        if (!userId) {
            cb(false, 'Invalid token!', null);
            return;
        }
        cb(true, 'Success', userId)
    }

    listen(msg) {
        let {username, password, token} = msg;
        let cb = (success, msg, userId) => {
            if (!success) {
                this.emit({
                    success: false,
                    msg: msg
                });
                return;
            }
            console.log("uid");
            addUser(userId, this.handler, token => {
                this.emit({
                    success: true,
                    token: token
                });
            });
            this.handler.initFinal();
        };

        if (token) {
            this._authenticateToken(token, cb);
        }
        else {
            this._authenticate(username, password, cb);
        }

    }
}

class RegisterListener extends BaseSocketListener {
    constructor() {
        super('creation');
    }

    _register(username, password, cb) {
        db.fetchOne('SELECT id FROM users WHERE username = ?', [username],
        (err, row) => {
            if (row) {
                cb(false, 'User already exists!');
                return;
            }

            bcrypt.hash(password, 10, function(err, hash) {
                if (err) {
                    cb(false, 'Could not add user!');
                    return;
                }

                db.insertUser(username, hash, (err) => {
                    if (err) {
                        cb(false, 'Could not add user!');
                        return;
                    }

                    cb(true, 'User added');
                });
            });
        });
    }

    listen(msg) {
        let {username, password} = msg;
        this._register(username, password, (success, msg) => {
            this.emit({
                success: success,
                msg: msg
            });
        });
    }
}

class ConversationListener extends BaseSocketListener {
    constructor() {
        super('getConversations');
    }
    listen() {
        this.emit([
            {
                id: 1,
                name: 'User1'
            },
            {
                id: 2,
                name: 'User2'
            },
            {
                id: 3,
                name: 'User3'
            },
            {
                id: 4,
                name: 'User4'
            }
        ])
    }
}

class SocketHandler {
    constructor(socket) {
        this.socket = socket;
        this.authListener = new AuthenticateListener(this);
        this.registerListener = new RegisterListener();

        this.messageListener = new MessageListener();
        this.disconnectListener = new DisconnectListener();
        this.listeners = [this.messageListener, this.disconnectListener];
    }

    init() {
        this.authListener.init(this.socket);
        this.registerListener.init(this.socket);
    }

    initFinal() {
        this.listeners.forEach(listener => {
           listener.init(this.socket)
        });
    }
}

module.exports = {SocketHandler};
