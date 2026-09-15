local scene={}
local accountStatus='Loading account...'
local saveStatus=''

local function refreshAccount()
    JS.newRequest(
        'TechminoAccount.getDisplayName()',
        function(name)
            scene.widgetList.displayName:setText(name or '')
        end,
        function()
            saveStatus='Could not load the display name.'
        end,
        5,
        'techminoAccountName'
    )
    JS.newRequest(
        'TechminoAccount.getAccountLabel()',
        function(label)
            accountStatus=label or 'Not signed in'
        end,
        function()
            accountStatus='Account status unavailable'
        end,
        5,
        'techminoAccountLabel'
    )
end

local function saveDisplayName()
    local name=STRING.trim(scene.widgetList.displayName:getText())
    if #name==0 then
        MES.new('error','Enter a display name.')
        return
    end
    saveStatus='Saving...'
    JS.newPromiseRequest(
        JS.stringFunc([[
            TechminoAccount.setDisplayName(%s)
                .then((message) => _$_(message))
                .catch((error) => _$_('ERROR:' + (error && error.message ? error.message : 'Could not save the display name.')));
        ]],JSON.encode(name)),
        function(result)
            if result:sub(1,6)=='ERROR:' then
                saveStatus=result:sub(7)
                MES.new('error',saveStatus)
            else
                saveStatus=result
                MES.new('check','Display name saved.')
            end
        end,
        function()
            saveStatus='Could not save the display name.'
            MES.new('error',saveStatus)
        end,
        15,
        'techminoSaveDisplayName'
    )
end

local function manageSignIn()
    JS.callJS('TechminoAccount.open()')
end

function scene.enter()
    accountStatus='Loading account...'
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
    setFont(30)
    GC.setColor(COLOR.Z)
    GC.print('Display name',280,165)
    GC.print(accountStatus,360,320)
    if saveStatus~='' then
        GC.setColor(COLOR.lN)
        GC.print(saveStatus,360,365)
    end
end

scene.widgetList={
    WIDGET.newText{name='title',x=80,y=50,font=70,align='L',fText='Account'},
    WIDGET.newInputBox{name='displayName',x=360,y=150,w=520,h=70,font=36,limit=24},
    WIDGET.newButton{name='save',x=1000,y=185,w=220,h=70,color='lG',font=34,fText='Save',code=saveDisplayName},
    WIDGET.newButton{name='manage',x=640,y=470,w=420,h=90,color='lV',font=36,fText='Manage sign-in',code=manageSignIn},
    WIDGET.newButton{name='back',x=1140,y=640,w=170,h=80,sound='back',font=60,fText=CHAR.icon.back,code=pressKey'escape'},
}

return scene
