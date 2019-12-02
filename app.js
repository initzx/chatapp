const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const {SocketHandler, AuthenticateListener} = require("./src/Listeners");


io.on('connection', (socket) => new AuthenticateListener().init(socket));

http.listen(3000, () => {
    console.log('listening on *:3000');
});
