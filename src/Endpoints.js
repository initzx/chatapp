const bcrypt = require('bcrypt');
const AppDB = require('./Database');
const {getUserFromToken, setUserSocketHandler, addUser, removeSocketHandler, getSocketHandler} = require('./Sessions');

const db = new AppDB();

class BaseSocketEndpoint {
    /*
    Abstract base endpoint for all of the endpoints
     */

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

class MessageEndpoint extends BaseSocketEndpoint {
    /*
    This endpoint is accessed when the user decides to send a message
     */
    constructor() {
        super('message');
    }

    sendToReceiver(msg) {
        let receiverHandlers = getSocketHandler(msg.to);
        if (receiverHandlers) {
            receiverHandlers.forEach(receiverHandler =>
                receiverHandler.socket.emit('newMessage', {isReceiver: 1, from: this.socketHandler.userId, ...msg})
            );
        }
    }

    listen(msg) {
        let {receiver, content} = msg;
        let timestamp = new Date()/1;
        db.execute('INSERT INTO messages(`from`, `to`, content, timestamp) VALUES (?, ?, ?, ?)',
            [this.socketHandler.userId, receiver, content, timestamp]);

        this.sendToReceiver({
            to: receiver,
            content: content,
            timestamp: timestamp
        });
    }
}

class ConversationGetEndpoint extends BaseSocketEndpoint {
    /*
    This endpoint returns the messages that have been sent in a conversation
     */
    constructor() {
        super('getConversationMessages');
    }

    listen(msg) {
        let {userId} = msg;
        db.fetchAll('SELECT `to`, `from`, content, timestamp, CASE `to` WHEN $u THEN 1 ELSE 0 END isReceiver' +
            ' FROM messages WHERE (`from` = $u AND `to` = $t) OR (`from` = $t AND `to` = $u) ORDER BY timestamp ASC',
            {$u: this.socketHandler.userId, $t: userId}, (err, rows) => {
                if (err) {
                    this.emitError('Something bad happened!');
                    return;
                }
                this.emitSuccess({messages: rows})
            });

    }
}

class ConversationGetAllEndpoint extends BaseSocketEndpoint {
    /*
    This endpoint is accessed when the user attempts to fetch all of the users on the network
     */
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
            this.emitSuccess({conversations: rows});
        });
    }
}

class DisconnectEndpoint extends BaseSocketEndpoint {
    /*
    This endpoint is called when the user disconnects
     */
    constructor() {
        super('disconnect');
    }

    listen(msg) {
        removeSocketHandler(this.socketHandler.userId, this.socketHandler);
    }
}

class AuthenticateEndpoint extends BaseSocketEndpoint {
    /*
    This endpoint authenticates the user first time they connect
     */
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

class RegisterEndpoint extends BaseSocketEndpoint {
    /*
    This endpoint registers a user to the database
     */

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
    /*
    A container class for user socket endpoints

    The SocketHandler is unique to every user and contains the socket object
    for that user's connection. SocketHandler is initialized when a user connects
    to the server, the endpoints for which the user can access are also subsequently
    initialized here.

     */

    constructor(socket) {
        this.socket = socket;

        this.authenticateEndpoint = new AuthenticateEndpoint();
        this.registerEndpoint = new RegisterEndpoint();
        this.authEndpoints = [this.authenticateEndpoint, this.registerEndpoint];

        this.messageEndpoint = new MessageEndpoint();
        this.disconnectEndpoint = new DisconnectEndpoint();
        this.conversationGetAllEndpoint = new ConversationGetAllEndpoint();
        this.conversationGetEndpoint = new ConversationGetEndpoint();
        this.endpoints = [this.messageEndpoint, this.disconnectEndpoint, this.conversationGetAllEndpoint, this.conversationGetEndpoint];
    }

    init() {
        this.authEndpoints.forEach(listener => {
           listener.init(this);
        });
    }

    initFinal(userId) {
        this.userId = userId;
        this.endpoints.forEach(listener => {
           listener.init(this);
        });
    }
}

module.exports = {SocketHandler};
