local fs=love.filesystem

local WS={}
local sockets={}
local basePath=''

local function callJS(code)
    print('callJavascriptFunction '..code)
end

local function getSocket(name)
    local socket=sockets[name]
    if not socket then
        socket={
            status='dead',
            nextSeq=1,
            queue={},
            alertTimer=0,
            sendTimer=0,
            pongTimer=0,
        }
        sockets[name]=socket
    end
    return socket
end

local function handleEvent(name,event)
    local socket=getSocket(name)
    if event.type=='open' then
        socket.status='running'
        socket.pongTimer=1
    elseif event.type=='message' then
        local body=JSON.decode(event.data)
        if body and body.action==9000 and body.errno==0 and body.data then
            USER.uid=body.data.playerId
            USERS.updateUserData{
                id=body.data.playerId,
                username=body.data.username or 'Guest',
                motto='',
                avatar_hash='',
            }
        else
            socket.queue[#socket.queue+1]={event.data,'text'}
        end
    elseif event.type=='close' then
        socket.status='dead'
        socket.queue[#socket.queue+1]={JSON.encode{
            message=event.reason or 'Connection closed',
        },'close'}
    elseif event.type=='error' then
        socket.alertTimer=2.6
    end
end

local function updateSocket(name)
    local socket=getSocket(name)
    local countName='__techmino_ws_'..name..'_count'
    local count=tonumber(fs.getInfo(countName) and fs.read(countName)) or 0

    while socket.nextSeq<=count do
        local eventName=('__techmino_ws_%s_%08d'):format(name,socket.nextSeq)
        if not fs.getInfo(eventName) then break end
        local event=JSON.decode(fs.read(eventName))
        fs.remove(eventName)
        socket.nextSeq=socket.nextSeq+1
        if event then handleEvent(name,event) end
    end
end

function WS.switchHost(_,_,path)
    basePath=path or basePath
    for name in next,sockets do WS.close(name) end
end

function WS.connect(name,subPath)
    local socket=getSocket(name)
    socket.status='connecting'
    socket.nextSeq=1
    socket.queue={}
    callJS(('TechminoSocket.connect(%s,%s,%s)'):format(
        JSON.encode(name),
        JSON.encode(basePath..(subPath or '')),
        JSON.encode(fs.getSaveDirectory())
    ))
end

function WS.status(name)
    updateSocket(name)
    return getSocket(name).status
end

function WS.getTimers(name)
    local socket=getSocket(name)
    return socket.pongTimer,socket.sendTimer,socket.alertTimer
end

function WS.setPingInterval() end

function WS.alert(name)
    getSocket(name).alertTimer=2.6
end

function WS.send(name,message)
    if type(message)~='string' then return end
    local socket=getSocket(name)
    if socket.status=='running' then
        callJS(('TechminoSocket.send(%s,%s)'):format(JSON.encode(name),JSON.encode(message)))
        socket.sendTimer=1
    end
end

function WS.read(name)
    updateSocket(name)
    local queue=getSocket(name).queue
    if #queue>0 then
        local message=table.remove(queue,1)
        return message[1],message[2]
    end
end

function WS.close(name)
    local socket=getSocket(name)
    if socket.status~='dead' then
        callJS(('TechminoSocket.close(%s)'):format(JSON.encode(name)))
        socket.status='dead'
    end
end

function WS.update(dt)
    for name,socket in next,sockets do
        updateSocket(name)
        if socket.sendTimer>0 then socket.sendTimer=socket.sendTimer-dt end
        if socket.pongTimer>0 then socket.pongTimer=socket.pongTimer-dt end
        if socket.alertTimer>0 then socket.alertTimer=socket.alertTimer-dt end
    end
end

return WS
