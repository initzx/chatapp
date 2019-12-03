const app = require('express')();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const {SocketHandler} = require("./src/Listeners");


io.on('connection', (socket) => {
    new SocketHandler(socket).init();
});

http.listen(3000, () => {
    console.log('listening on *:3000');
});
