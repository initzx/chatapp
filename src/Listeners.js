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

    listen (msg) {
        console.log("Message: "+msg);
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
    constructor() {
        super('auth')
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
                        cb(true, 'Success', row.userId);
                        return;
                    }

                    cb(false, 'Credentials do not match!');
                });
            }
        );
    }

    listen(msg) {
        let {username, password} = msg;
        this._authenticate(username, password, (success, msg, userId=null)=> {
           if (!success) {
               this.socket.emit('auth', {
                   success: false,
                   msg: msg
               });
               return;
           }

            let handler = new SocketHandler(this.socket);

            addUser(userId, handler, token => {
                this.socket.emit('auth', {
                    success: true,
                    token: token
                });
            });
            handler.init();
        });
    }
}

class RegisterListener extends BaseSocketListener {
    constructor() {
        super('register');
    }

    _register(username, password) {

    }

    listen(msg) {

    }
}

class SocketHandler {
    constructor(socket) {
        this.socket = socket;
        this.messageListener = new MessageListener();
        this.disconnectListener = new DisconnectListener();
        this.listeners = [this.messageListener, this.disconnectListener];
    }

    init() {
        this.listeners.forEach(listener => {
           listener.init(this.socket)
        });
    }
}

module.exports = {SocketHandler, AuthenticateListener};
