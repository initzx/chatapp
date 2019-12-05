const bcrypt = require('bcrypt');
const AppDB = require('./Database');
const {getUserFromToken, setUserSocketHandler, addUser, removeSocketHandler} = require('./Tokens');

const db = new AppDB();

class BaseSocketListener {

    constructor(type) {
        this.type = type;
    }

    init(socketHandler) {
        this.socketHandler = socketHandler;
        this.socket = socketHandler.socket;
        this.socket.on(this.type, (msg) => this.listen(msg));
    }

    listen(msg) {
        console.log("Message: "+msg);
    }

    emit(msg) {
        this.socket.emit(this.type, msg);
    }

    emitError(msg) {
        this.emit({success: false, ...msg})
    }

    emitSuccess(msg) {
        this.emit({success: true, ...msg})
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

class ConversationListener extends BaseSocketListener{
    constructor() {
        super('getConversations');
    }

    listen(msg) {
        db.fetchAll('SELECT id, username FROM users WHERE id != ?', [this.socketHandler.userId],
            (error, rows) => {
            if (error) {
                this.emitError({msg: 'Something bad happened!'});
                return;
            }
            this.emitSuccess(rows);
        });
    }
}

class DisconnectListener extends BaseSocketListener {
    constructor() {
        super('disconnect');
    }

    listen(msg) {
        removeSocketHandler(this.socketHandler.userId, this.socketHandler);
    }
}

class AuthenticateListener extends BaseSocketListener {
    constructor() {
        super('auth');
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
        if (token) {
            this._authenticateToken(token, (success, msg, userId) => {
                if (!success) {
                    this.emitError({
                        msg: msg
                    });
                    return;
                }

                setUserSocketHandler(userId, this.socketHandler);
                this.emitSuccess({
                    token: token
                });

                this.socketHandler.initFinal(userId);
            });
        }
        else {
            this._authenticate(username, password, (success, msg, userId) => {
                if (!success) {
                    this.emitError({
                        msg: msg
                    });
                    return;
                }

                addUser(userId, this.socketHandler, token => {
                    this.emitSuccess({
                        token: token
                    });
                });

                this.socketHandler.initFinal(userId);
            });
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

class SocketHandler {
    constructor(socket) {
        this.socket = socket;

        this.authenticateListener = new AuthenticateListener();
        this.registerListener = new RegisterListener();
        this.authListeners = [this.authenticateListener, this.registerListener];

        this.messageListener = new MessageListener();
        this.disconnectListener = new DisconnectListener();
        this.conversationListener = new ConversationListener();
        this.listeners = [this.messageListener, this.disconnectListener, this.conversationListener];
    }

    init() {
        this.authListeners.forEach(listener => {
           listener.init(this);
        });
    }

    initFinal(userId) {
        this.userId = userId;
        this.listeners.forEach(listener => {
           listener.init(this);
        });
    }
}

module.exports = {SocketHandler};
