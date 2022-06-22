//imports
const express = require("express"); //express is the web application framework:eases access and manipulation on the server
const { Server } = require("socket.io");//web sockets:for bidirectional communication btn server and clients
const { S3Client, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Client } = require('pg');


//the server object acts as the controller in mvc model

const http = require("http"); //the http server : so that the socket can access the internet using http protocol 
const path = require('path'); // path is an object that is used to join paths of the distributed documents ,as the server needs the path of the files to be absolute,it converts the relative patths that i wrote to abolute paths that is based in the server
const crypto = require("crypto");//random id generator to create the file name that is later shared ,also is unique
const app = express();//initialization of express framework
const REGION = "eu-west-3";// Set the AWS Region.
const s3Client = new S3Client({ region: REGION });
const db = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});
db.connect();
const bucket1 = 'docsdistributed'
const bucket2 = 'docsdistributed2'

const port = process.env.PORT || 9000;//define port to be used ,9000 incase of local or if the server didnt define the port number for the connection

const server = http.createServer(app); //initialize http server
app.use(express.static(path.join(__dirname)));//middleware for any request to use a static root which is the current directory 



const streamToString = (stream) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        stream.on("data", (chunk) => chunks.push(chunk));
        stream.on("error", reject);
        stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });

//initialize the WebSocket server instance
const io = new Server(server);


io.on("connection", async (socket) => { //when a connection is established the function below runs
    try {
        const result = await db.query('SELECT name from files')
        socket.emit('files', result.rows)
    } catch (error) {
        console.log(error)
    }

    let currentRoom = '' //define where am i connected currently ,meaning which distributrd document or if its a new document
    socket.on('join', async (roomName, password) => {
        socket.to(currentRoom).emit('leaving', socket.id)
        socket.leave(currentRoom)
        try {
            const result = await db.query('SELECT name from files Where name=$1 AND password=$2', [roomName, password])
            if (result.rowCount != 1) {
                socket.emit('init', 'error', 'Inorrect Creds')
                return
            }
        } catch (error) {
            socket.emit('init', 'error', 'Inorrect Creds')
            return
        }
        const sockets = await io.in(roomName).fetchSockets();
        socket.join(roomName)
        socket.to(roomName).emit('joining', socket.id)
        if (sockets.length === 0) {
            try {
                const { Body } = await s3Client.send(new GetObjectCommand({
                    Bucket: bucket1, // The name of the bucket. For example, 'sample_bucket_101'.
                    Key: roomName + '.txt', // The name of the object. For example, 'sample_upload.txt'.
                }));
                const bodyContents = await streamToString(Body);
                socket.emit('init', JSON.parse(bodyContents), 1, roomName)
            } catch (err) {
                try {
                    const { Body } = await s3Client.send(new GetObjectCommand({
                        Bucket: bucket2, // The name of the bucket. For example, 'sample_bucket_101'.
                        Key: roomName + '.txt', // The name of the object. For example, 'sample_upload.txt'.
                    }));
                    const bodyContents = await streamToString(Body);
                    socket.emit('init', JSON.parse(bodyContents), 1, roomName)
                } catch (err) {
                    console.log("Error", err);
                    socket.emit('init', 'error', 'Failed to retrive file')
                    return
                }
            }
        }
        else {
            io.to(sockets[0].id).emit('requestInit', socket.id)//server asks from the first connection in the room to send the current document's parameters
        }
        currentRoom = roomName

    })

    socket.on('onChange', e => {
        socket.to(currentRoom).emit('change', e)
    })//if the current client changes the document ,it sends it to all other participants
    socket.on('answerInit', (id, data, initCount) =>
        io.to(id).emit('init', data, initCount, currentRoom)
    )//when the response from line 41 is recived ,the new connection recives that reply
    socket.on('save', async (value, fileID, passwordID) => {//creates a name to file if it doesnt exist and saves it
        let file, password;
        if (fileID) {
            file = fileID;
            password = passwordID;
            try {
                const result = await db.query('SELECT name from files Where name=$1 AND password=$2', [file, password])
                if (result.rowCount != 1) {
                    socket.emit('share', 'error', 'Incorrect Password')
                    return
                }
            } catch (error) {
                socket.emit('share', 'error', 'Database error')
                console.log(error)
                return
            }
        }
        else {
            file = crypto.randomBytes(16).toString("hex");//create new name
            password = crypto.randomBytes(16).toString("hex");//create new name
            try {
                await db.query('Insert INTO files(name,password) VALUES($1, $2) ', [file, password])
            } catch (error) {
                socket.emit('share', 'error', 'Database error')
                console.log(error)
                return
            }
            socket.join(file);//connect to document law hasharo l7ad
            currentRoom = file;
        }
        try {
            await s3Client.send(new PutObjectCommand({
                Bucket: bucket1, // The name of the bucket. For example, 'sample_bucket_101'.
                Key: file + '.txt', // The name of the object. For example, 'sample_upload.txt'.
                Body: JSON.stringify(value), // The content of the object. For example, 'Hello world!".
            }));
        } catch (err) {
            try {

                await s3Client.send(new PutObjectCommand({
                    Bucket: bucket2, // The name of the bucket. For example, 'sample_bucket_101'.
                    Key: file + '.txt', // The name of the object. For example, 'sample_upload.txt'.
                    Body: JSON.stringify(value), // The content of the object. For example, 'Hello world!".
                }));
            } catch (err) {
                console.log("Error", err);
                io.to(currentRoom).emit('share', 'error', 'Failed to save file')
                return
            }
        }

        io.to(currentRoom).emit('share', file, password)//returns the name to the client
        io.emit('new_file', file)//returns the name to the client
    })
    socket.on("disconnecting", (reason) => {
        socket.to(currentRoom).emit("leaving", socket.id);

    });//if socket disconnects (eg timeout) the socket leaves the currect document 
});
//start our server
//if the client requests the home route (for example entering the url of the page) it will return the index_copy page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index_copy.html');
});

//this server will listen to any requests on the port number defined 
server.listen(port, () => {
    console.log(`Signaling Server running on port: ${port}`);
});