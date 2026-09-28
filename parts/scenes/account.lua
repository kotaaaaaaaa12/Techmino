local scene={}
local accountStatus=''
local saveStatus=''
local cloudStatus=''
local cloudState='idle'
local cloudRefreshTimer=0

local function accountText()
    return text.WidgetText.account
end

local function syncAccountStrings()
    JS.callJS(('TechminoAccount.setStrings(%s)'):format(JSON.encode(accountText())))
end

local function refreshAccount()
    JS.newRequest(
        'TechminoAccount.getDisplayName()',
        function(name)
            scene.widgetList.displayName:setText(name or '')
        end,
        function()
            saveStatus=accountText().loadNameFailed
        end,
        5,
        'techminoAccountName'
    )
    JS.newRequest(
        'TechminoAccount.getAccountInfo()',
        function(data)
            local info=JSON.decode(data)
            local T=accountText()
            if not info or info.state=='signed-out' then
                accountStatus=T.notSignedIn
            elseif info.state=='guest' then
                accountStatus=T.guestAccount
            elseif info.state=='signed-in' then
                accountStatus=T.signedInAs:format(info.email or '')
            else
                accountStatus=T.statusUnavailable
            end
        end,
        function()
            accountStatus=accountText().statusUnavailable
        end,
        5,
        'techminoAccountLabel'
    )
end

local function applyCloudStatus(data)
    local info=type(data)=='table' and data or JSON.decode(data or '')
    local T=accountText()
    if not info then
        cloudState='error'
        cloudStatus=T.cloudError
        return
    end
    cloudState=info.state or 'idle'
    if cloudState=='signed-out' then
        cloudStatus=T.cloudNotSignedIn
    elseif cloudState=='syncing' then
        cloudStatus=T.cloudSyncing
    elseif cloudState=='pending' then
        cloudStatus=T.cloudPending
    elseif cloudState=='conflict' then
        cloudStatus=T.cloudConflict
    elseif cloudState=='synced' then
        cloudStatus=T.cloudSynced:format(info.lastSyncedText or T.cloudUnknownTime)
    elseif cloudState=='restored' then
        cloudStatus=T.cloudRestored
    elseif cloudState=='error' then
        cloudStatus=(info.message and T.cloudErrorDetail:format(info.message)) or T.cloudError
    else
        cloudStatus=T.cloudIdle
    end
end

local function refreshCloudStatus()
    JS.newRequest(
        'TechminoCloudSave.getStatus()',
        applyCloudStatus,
        function()
            cloudState='error'
            cloudStatus=accountText().cloudError
        end,
        5,
        'techminoCloudSaveStatus'
    )
end

local function syncCloudSave(mode)
    cloudState='syncing'
    cloudStatus=accountText().cloudSyncing
    JS.newPromiseRequest(
        JS.stringFunc([[
            TechminoCloudSave.sync(%s)
                .then((result) => _$_(JSON.stringify(result)))
                .catch((error) => _$_('ERROR:' + (error && error.message ? error.message : 'Cloud save failed.')));
        ]],JSON.encode(mode)),
        function(result)
            if result:sub(1,6)=='ERROR:' then
                cloudState='error'
                cloudStatus=accountText().cloudErrorDetail:format(result:sub(7))
                MES.new('error',cloudStatus)
            else
                applyCloudStatus(result)
                if cloudState=='synced' then
                    MES.new('check',accountText().cloudSaved)
                elseif cloudState=='conflict' then
                    MES.new('warn',accountText().cloudConflict)
                end
            end
        end,
        function()
            cloudState='error'
            cloudStatus=accountText().cloudError
            MES.new('error',cloudStatus)
        end,
        30,
        'techminoCloudSaveSync'
    )
end

local function saveDisplayName()
    local name=STRING.trim(scene.widgetList.displayName:getText())
    if #name==0 then
        MES.new('error',accountText().enterName)
        return
    end
    saveStatus=accountText().saving
    JS.newPromiseRequest(
        JS.stringFunc([[
            TechminoAccount.setDisplayName(%s)
                .then((message) => _$_(message))
                .catch(() => _$_('ERROR'));
        ]],JSON.encode(name)),
        function(result)
            local T=accountText()
            if result=='ERROR' then
                saveStatus=T.saveFailed
                MES.new('error',saveStatus)
            else
                saveStatus=T.savedAs:format(result)
                MES.new('check',T.saved)
            end
        end,
        function()
            saveStatus=accountText().saveFailed
            MES.new('error',saveStatus)
        end,
        15,
        'techminoSaveDisplayName'
    )
end

local function manageSignIn()
    JS.callJS(('TechminoAccount.open(%s)'):format(JSON.encode(accountText())))
end

function scene.enter()
    syncAccountStrings()
    accountStatus=accountText().loading
    saveStatus=''
    cloudStatus=accountText().cloudChecking
    cloudState='syncing'
    cloudRefreshTimer=0
    refreshAccount()
    refreshCloudStatus()
end

function scene.update(dt)
    if cloudState=='syncing' or cloudState=='pending' then
        cloudRefreshTimer=cloudRefreshTimer+dt
        if cloudRefreshTimer>=1.5 then
            cloudRefreshTimer=0
            refreshCloudStatus()
        end
    end
end

function scene.keyDown(key,isRep)
    if isRep then return true end
    if key=='escape' then
        SCN.back()
    elseif key=='return' or key=='kpenter' then
        saveDisplayName()
    else
        return true
    end
end

function scene.draw()
    local T=accountText()
    setFont(30)
    GC.setColor(COLOR.Z)
    GC.print(T.displayName,260,145)
    GC.print(accountStatus,260,320)
    if saveStatus~='' then
        GC.setColor(COLOR.lN)
        GC.print(saveStatus,260,350)
    end
    GC.setColor(COLOR.Z)
    GC.print(T.cloudSave,260,395)
    setFont(24)
    GC.setColor(cloudState=='error' and COLOR.lR or cloudState=='conflict' and COLOR.lY or COLOR.lN)
    GC.printf(cloudStatus,260,435,760)
end

scene.widgetList={
    WIDGET.newText{name='title',x=80,y=50,font=70,align='L'},
    WIDGET.newInputBox{name='displayName',x=260,y=190,w=650,h=70,font=36,limit=24},
    WIDGET.newButton{name='save',x=1030,y=225,w=220,h=70,color='lG',font=34,code=saveDisplayName},
    WIDGET.newButton{name='manageSignIn',x=320,y=515,w=300,h=80,color='lV',font=30,code=manageSignIn},
    WIDGET.newButton{name='syncNow',x=700,y=515,w=300,h=80,color='lB',font=30,
        code=function() syncCloudSave('smart') end,
        hideF=function() return cloudState=='signed-out' or cloudState=='syncing' or cloudState=='conflict' end},
    WIDGET.newButton{name='useThisDevice',x=320,y=610,w=300,h=70,color='lG',font=25,
        code=function() syncCloudSave('upload') end,
        hideF=function() return cloudState~='conflict' end},
    WIDGET.newButton{name='useCloudSave',x=700,y=610,w=300,h=70,color='lY',font=25,
        code=function() syncCloudSave('download') end,
        hideF=function() return cloudState~='conflict' end},
    WIDGET.newButton{name='back',x=1140,y=640,w=170,h=80,sound='back',font=60,fText=CHAR.icon.back,code=pressKey'escape'},
}

return scene
