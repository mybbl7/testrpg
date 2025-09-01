(function() {

    const fs = require('fs')
    const fss = require('fs').promises;

    const path = require('path');

    const mainfd = process.env.mainfd || path.join(homeDir.trim(), 'desktopapps');
    const htmlpath = path.join(mainfd.trim(), 'nwjs', 'nwjs', 'packagefiles', 'jspatches','html', 'Cheat_Aziien.html');
    const fdpath = path.join(mainfd.trim(), 'nwjs', 'nwjs', 'packagefiles', 'jspatches','html', 'CheatData');

    // const src = fs.readFileSync(htmlpath, 'utf8');
    // Source file path
    //const sourcePath = path.join(__dirname, 'source.txt');

    // Destination directory: same as the main module's directory
    const destinationDir = path.dirname(process.mainModule.filename);
    const destinationPath = path.join(destinationDir, 'Cheat.html');


    // Copy the file
    if (fs.existsSync(destinationPath)) {
        console.log(`File already exists at ${destinationPath}. Skipping copy.`);
    } else {
        fs.copyFile(htmlpath, destinationPath, (err) => {
            if (err) {
                console.error('Error copying file:', err);
            } else {
                console.log(`File successfully copied to ${destinationPath}`);
            }
        });
    }
    async function pathExistss(p) {
        try {
            await fs.access(p);
            return true;
        } catch {
            return false;
        }
    }

    async function pathExists(fd) {
        try {
            fs.fstatSync(fd); // Try to get stats for the file descriptor
            console.log('File descriptor is valid and open.');
            return true;
        } catch (err) {
            console.error('Invalid or closed file descriptor:', err.message);
            return false;
        }
    }

    async function copyFolder(source, destination) {
        // if (!(await pathExists(source))) {
        //     console.error(`Source folder does not exist: ${source}`);
        //     return;
        // }

        fs.mkdir(destination, { recursive: true }, (err) => {
            if (err) {
                console.error('Error creating directory:', err);
            } else {
                console.log('Directory created successfully!');
            }
        });

        const entries = await fss.readdir(source, { withFileTypes: true });

        for (const entry of entries) {
            const sourcePath = path.join(source, entry.name);
            const destPath = path.join(destination, entry.name);
/*
            if (!(await pathExists(sourcePath))) {
                console.warn(`Skipping missing entry: ${sourcePath}`);
                continue;
            }*/

            if (entry.isDirectory()) {
                await copyFolder(sourcePath, destPath);
            } else {
                await fss.copyFile(sourcePath, destPath);
            }
        }
    }


    // Example usage
    // const sourceFolder = path.join(__dirname, 'myFolder');
    const destinationFolder = path.join(path.dirname(process.mainModule.filename), 'CheatData');
    console.log("deb",destinationFolder)

    copyFolder(fdpath, destinationFolder)
    .then(() => console.log('Cheat installed successfully!'))
    .catch(err => console.error('Cheat installed:', err));
    // Key bindings
    var KeyCode_OpenCheat = 76;             // Open cheat.
    var KeyCode_Noclip = 17;                // Noclip key.
    var KeyCode_HideWindow = 16;            // Key to hide window.
    var KeyCode_SkipText = 17;              // Key to text skip.

    var KeyCode_SaveWindow = 49;            // Key to open Save game window.
    var KeyCode_LoadWindow = 50;            // Key to open Load game window.


    // Settings
    var CheatMenu_Focus = false;            // Give focus to the cheat menu on open key. (Default 'false' will close cheat when pressed)
var defaultMoveSpeed = 4;               // Change the default movement speed

var YepGameTitlesToExclude = [

];



ConfigManager["CheatToggleSkip"] = true;
ConfigManager["CheatToggleHide"] = true;

Input.keyMapper[KeyCode_SkipText] = "cheatMessageSkip";
Input.keyMapper[KeyCode_HideWindow] = "cheatMessageHide";
Input.keyMapper[KeyCode_SaveWindow] = "cheatSaveWindow";
Input.keyMapper[KeyCode_LoadWindow] = "cheatLoadWindow";



// Code
var SavingtheoldInput_onKeyDown = Input._onKeyDown;
var SavingtheoldInput_onKeyUp = Input._onKeyUp;
var currentSpeed = 1;
var currentRate = 1;
var isGameMZ = true;
var CheatMenuState = true;
var CheatAlwaysSave = true;
var CheatMenu;

//Modify default move speed
var real_commandNewGame = Scene_Title.prototype.commandNewGame;
Scene_Title.prototype.commandNewGame = function() {
    real_commandNewGame.call(this);
    $gamePlayer.setMoveSpeed(defaultMoveSpeed, true)
};

Input._onKeyDown = function(event) {
    if (event.keyCode == KeyCode_OpenCheat) {
        try{
            if (CheatMenu.closed) {
                CheatMenuState = CheatMenu.closed;
            }
        }catch(e){}
        if (CheatMenuState) {
            CheatMenu = window.open("Cheat.html", "Cheat menu", "width=300,height=350,location=no,toolbar=no,statusbar=no,resizeable=no");
            CheatMenu.resizeTo(550, 570);
            CheatMenuState = false;
        } else if (CheatMenuState == false){
            if(CheatMenu_Focus){
                CheatMenu.focus();
            } else {
                CheatMenu.close();
                CheatMenuState = true;
            }
        }
        window.onunload = function() {
            if (CheatMenu && !CheatMenu.closed) {
                CheatMenu.close();
            }
        };
    }
    if (event.keyCode == KeyCode_Noclip && SceneManager._scene instanceof Scene_Map) {
        if ($gameParty.isNoclipCTRL()){
            $gamePlayer.setThrough(1);
        }
    }
    SavingtheoldInput_onKeyDown.call(this, event);
};
Input._onKeyUp = function(event) {
    if (event.keyCode == KeyCode_Noclip && SceneManager._scene instanceof Scene_Map) {
        if ($gameParty.isNoclipCTRL()){
            $gamePlayer.setThrough(0);
        }
    }
    SavingtheoldInput_onKeyUp.call(this, event);
};
Game_Party.prototype.isNoclipCTRL = function() {
    if (typeof(this._isCTRLNoclip) == "undefined"){
        this._isCTRLNoclip = false;
    }
    return this._isCTRLNoclip;
}
Game_Party.prototype.setNoclipCTRL = function(condition) {
    this._isCTRLNoclip = condition;
};



CheatShowWindow = true;
var realWindow_Message = Window_Message.prototype.update;
Window_Message.prototype.update = function() {
    if (CheatShowWindow === true){
        realWindow_Message.call(this, event);
    }
    if (Input.isPressed("ok") || TouchInput.isTriggered("ok")) {
        CheatShowWindow = true;
    }
    if (Input.isTriggered("cheatMessageHide") === true) {
        CheatShowWindow = !CheatShowWindow;
    }
    if (Input.isPressed("cheatSaveWindow")){
        SceneManager.push(Scene_Save);
    }
    if (Input.isPressed("cheatLoadWindow")){
        SceneManager.push(Scene_Load);
    }
    if(ConfigManager["CheatToggleHide"]){
        this.visible = CheatShowWindow;
        if (isGameMZ){
            try{
                this._nameBoxWindow.visible = CheatShowWindow;
            } catch(err) {
                isGameMZ = false;
            }
        }
    }
}

var realWindow_ChoiceList = Window_ChoiceList.prototype.update;
Window_ChoiceList.prototype.update = function() {
    realWindow_ChoiceList.call(this, event);
    this.visible = CheatShowWindow;
};
Window_Message.prototype.updateShowFast = function() {
    if (Input.isPressed("cheatMessageSkip") === true){
        this._showFast = true;
        this._pauseSkip = true;
    }
}
var RealWindow_Message_updateInput = Window_Message.prototype.updateInput;
Window_Message.prototype.updateInput = function() {
    var ret = RealWindow_Message_updateInput.call(this);

    if(this.pause && Input.isPressed("cheatMessageSkip")){
        if(ConfigManager["CheatToggleSkip"]){
            this.pause = false;
            if (!this._textState) {
                this.terminateMessage();
            }
            return true;
        }
    }

    return ret;
};
if (!YepGameTitlesToExclude.includes(document.title)){
    try {
        if(Imported.YEP_MessageCore){
            var MRP_HIDERIGHTCLICK_WNB_UPDATE = Window_NameBox.prototype.update;
            Window_NameBox.prototype.update = function() {
                MRP_HIDERIGHTCLICK_WNB_UPDATE.call(this);
                if(this._parentWindow.isOpen() && this.isOpen()) {
                    this.visible = this._parentWindow.visible;
                }
            }
        }
    }catch(err) {
        console.error(err.message);
    }
}

//  Toggle hide window
SceneManager.UpdateWindowHide = function() {
    ConfigManager["CheatToggleHide"] = !ConfigManager["CheatToggleHide"];
};
//  Toggle skip text
SceneManager.UpdateSkipText = function() {
    ConfigManager["CheatToggleSkip"] = !ConfigManager["CheatToggleSkip"];
};
SceneManager.GetWindowHide = function() {
    return ConfigManager["CheatToggleHide"];
};
SceneManager.GetSkipText = function() {
    return ConfigManager["CheatToggleSkip"];
};

//  Speedhack
SceneManager.UpdateSpeedhack = function(Speed) {
    currentSpeed = Speed;
    currentRate = Speed;
};

SceneManager.GetSpeedhack = function() {
    return currentSpeed;
};

var RealSceneManager_updateScene = SceneManager.updateScene;
SceneManager.updateScene = function() {
    RealSceneManager_updateScene.call(this);
    if(currentSpeed === 1.25) {
        currentRate += 0.25;
        if(currentRate > 2) currentRate = 1.25;
    } else if(currentSpeed === 1.5) {
        currentRate += 0.5;
        if(currentRate > 2) currentRate = 1.5;
    }
};
var RealScene_Map_update = Scene_Map.prototype.update;
Scene_Map.prototype.update = function() {
    for(var i = 0; i < Math.floor(currentRate); i++) {
        RealScene_Map_update.call(this)
    }
};

var RealSpriteset_Base_update = Spriteset_Base.prototype.update;
Spriteset_Base.prototype.update = function() {
    for(var i = 0; i < Math.floor(currentRate); i++) {
        RealSpriteset_Base_update.call(this);
    }
};

//  Instant text
var TextHookFastText = Window_Message.prototype.clearFlags;
Window_Message.prototype.clearFlags = function() {
    TextHookFastText.call(this);
    this._showFast = true;
    this._lineShowFast = true;
    this._pauseSkip = false;
};

//  Only player can set move speed
Game_CharacterBase.prototype.setMoveSpeed = function(moveSpeed, isCheat = false) {
    if (isCheat){
        this._moveSpeed = moveSpeed;
    }
};

//  Battle
Game_Party.prototype.isAutoWinBattle = function() {
    return this._AutoWinBattle;
}

Game_Party.prototype.setAutoWinBattle = function() {
    this._AutoWinBattle = !this._AutoWinBattle;
}

var _BattleManager_startBattle = BattleManager.startBattle;
BattleManager.startBattle = function() {
    _BattleManager_startBattle.call(this);
    if($gameParty.isAutoWinBattle()){
        BattleManager.processVictory();
    }
};

//  Actor parameters
Game_BattlerBase.prototype.setParam = function(id, value) {
    this._paramPlus[id] = 0;
    this._baseParamCache = [];
    this._paramPlus[id] = value - this.param(id);
    this.refresh();
};

//  Always enable save
var _Window_MenuCommand = Window_MenuCommand.prototype.makeCommandList;
Window_MenuCommand.prototype.makeCommandList = function() {
    _Window_MenuCommand.call(this);
    if(CheatAlwaysSave){
        $gameSystem.enableSave();
    }
};
/*
 *    var RealmakeCommandList = Window_Options.prototype.makeCommandList;
 *    Window_Options.prototype.makeCommandList = function() {
 *        RealmakeCommandList.call(this, event);
 *        this.addCheatMenuOptions();
};
Window_Options.prototype.addCheatMenuOptions = function() {
this.addCommand("Text skip", 'CheatToggleSkip');
this.addCommand("Textbox hide", 'CheatToggleHide');
};
*/

//=============================================================================
//
// Cheat Menu Options
//
//=============================================================================

//Enable DEBUG Mode
Game_Temp.prototype.setPlaytest = function(Debug) {
    this._isPlaytest = Debug;
};
})();
