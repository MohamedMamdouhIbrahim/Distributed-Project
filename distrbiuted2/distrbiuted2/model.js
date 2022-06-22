document.addEventListener('DOMContentLoaded', function () {//Waits for the document to load before run the function
    let sharebtn = document.querySelector("#share")//select the share button
    let connectForm = document.querySelector("#connect")//select the connect form
    let connectId = document.querySelector("#connect_id")//select the connect div
    let passwordInput = document.querySelector("#password")//select the connect div
    let connectedP = document.querySelector("#connected")//select the connect span
    let download = document.querySelector("#download") //select the download button
    let save = document.querySelector("#save")//select the save button

    let editor = new Quill('#txt_editor', {
        theme: 'snow'
    });//initialize the text editor 
    let connected = 0;//initialize the connected participants
    let fileID = '';//initialize the file name
    let passwordID = '';//initialize the file name
    let initRender = false; //initialize if update to false
    editor.on('text-change', function (delta, oldDelta, source) {//law et8ayar 7aga fel document
        if (source == 'user') {//laww men3andi eb3at el et8ayar
            sendChanges(delta);
        }
    });

    const socket = io();//initialize the socket

    socket.on("init", (data, initCount, file) => {//recive the initial document parameters
        console.log(data)
        if (data === 'error') {
            document.querySelector('#id').innerText = initCount;
            return
        }
        editor.setContents(data, 'api');
        connected = initCount;
        connectedP.innerText = connected;
        fileID = file
        initRender = false
    });
    socket.on('files', names => {
        const defaultOpt= document.createElement('option')
        defaultOpt.innerText = "File ID";
        defaultOpt.value=''
        connectId.appendChild(defaultOpt);
        names.forEach(name => {
            console.log(name)
            const opt = document.createElement('option')
            opt.innerText = name.name;
            connectId.appendChild(opt);
        });
    })
    socket.on('new_file', name => {
        const opt = document.createElement('option')
        opt.innerText = name;
        connectId.appendChild(opt);
    })
    socket.on("requestInit", (id) => {//send the initial document parameters on requested
        socket.emit('answerInit', id, editor.getContents(), connected)
    });
    socket.on("change", (data) => {//if another client change the document apply the changes
        initRender = true
        editor.updateContents(data, 'api');
        initRender = false
    });
    socket.on("joining", () => {// when a client joins the current document increment connected by one
        connected += 1;
        connectedP.innerText = connected;
    });
    socket.on("leaving", () => {// when a client leaves the current document decrement connected by one
        connected -= 1;
        connectedP.innerText = connected;
    });
    socket.on('share', (file, password) => {// when recive the share document name displayed
        if (file === 'error') {
            document.querySelector('#id').innerText = password;
            return
        }
        fileID = file;
        passwordID = password;
        document.querySelector('#id').innerText = fileID + ',' + password;
        if (!connected) {
            connected = 1;
            connectedP.innerText = connected;
        }
    })



    sharebtn.onclick = () => {//when share button is clicked display the document name if existed, if not request to save it
        console.log(editor.getContents())
        if (fileID)
            document.querySelector('#id').innerText = fileID + ',' + passwordID;
        else
            socket.emit('save', editor.getContents())
    }

    save.onclick = e => {// save the current document
        e.preventDefault();
        socket.emit('save', editor.getContents(), fileID, passwordID)


    }
    download.onclick = () => {// if download button is clicked save the document value to a file and download it offline
        const value = editor.getText()
        console.log(value)
        var fileBlob = new Blob([value], { type: "application/text" });//saves the text inside doc

        download.setAttribute("href", URL.createObjectURL(fileBlob));
        download.setAttribute("download", "*.txt");
    }

    connectForm.onsubmit = (e) => {// send connection rquest to another document
        e.preventDefault();
        editor.setText('', 'api');
        initRender = true;
        passwordID = passwordInput.value
        socket.emit('join', connectId.value, passwordInput.value)
    }




    const sendChanges = (e) => {
        socket.emit("onChange", e)
    }
});
