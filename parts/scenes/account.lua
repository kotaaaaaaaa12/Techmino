local scene={}
local accountStatus=''
local saveStatus=''

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
    refreshAccount()
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
        GC.print(saveStatus,260,365)
    end
end

scene.widgetList={
    WIDGET.newText{name='title',x=80,y=50,font=70,align='L'},
    WIDGET.newInputBox{name='displayName',x=260,y=190,w=650,h=70,font=36,limit=24},
    WIDGET.newButton{name='save',x=1030,y=225,w=220,h=70,color='lG',font=34,code=saveDisplayName},
    WIDGET.newButton{name='manageSignIn',x=640,y=480,w=420,h=90,color='lV',font=36,code=manageSignIn},
    WIDGET.newButton{name='back',x=1140,y=640,w=170,h=80,sound='back',font=60,fText=CHAR.icon.back,code=pressKey'escape'},
}

return scene
