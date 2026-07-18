# OpenShare — UML Diagrams

> Diagrams are written in [PlantUML](https://plantuml.com/) syntax. You can
> render them with the PlantUML VS Code extension, the IntelliJ plugin, or the
> online server at https://www.plantuml.com/plantuml.

## 1. Use Case Diagram

```plantuml
@startuml
left to right direction
actor User as U

rectangle OpenShare {
  usecase "Create / Delete Profile" as UC1
  usecase "Authenticate Platform" as UC2
  usecase "Add Videos (drag & drop)" as UC3
  usecase "Edit Title / Description / Privacy" as UC4
  usecase "Schedule Future Upload" as UC5
  usecase "Run Daily Upload" as UC6
  usecase "Monitor Progress" as UC7
  usecase "Configure Settings" as UC8
}

U -- UC1
U -- UC2
U -- UC3
U -- UC4
U -- UC5
U -- UC6
U -- UC7
U -- UC8

UC2 ..> (TikTok Auth)
UC2 ..> (YouTube Auth)
UC2 ..> (Instagram Auth)
@enduml
```

## 2. Class Diagram

```plantuml
@startuml
class Profile {
  + String id
  + String name
  + Map auth
  + String defaultDesc
  + listFiles() : FileMeta[]
  + createProfile(name)
  + deleteProfile(id)
}

class FileMeta {
  + String name
  + String path
  + Date scheduledAt
  + String status
  + String[] platforms
  + String privacy
  + boolean madeForKids
  + String title
  + String desc
}

class Quota {
  + Date date
  + int used
  + remaining() : int
}

class AuthService {
  + authenticate(platform, win)
  + loadSecrets()
  + saveSecrets(secrets)
}

class Uploader {
  + uploadToPlatform(platform, tokens, path, opts)
  + uploadToTikTok(...)
  + uploadToYouTube(...)
  + uploadToInstagram(...)
  + getYouTubeChannel(tokens)
}

class MainProcess {
  + runDailyForProfile(profileId)
  + ipcHandlers
}

Profile "1" *-- "many" FileMeta
Profile "1" *-- "1" Quota
MainProcess ..> Profile
MainProcess ..> AuthService
MainProcess ..> Uploader
Uploader ..> FileMeta
@enduml
```

## 3. Sequence Diagram — Daily Upload Run

```plantuml
@startuml
actor User
participant Renderer
participant Main as "Main Process"
participant Store as "electron-store"
participant Uploader
participant Platform as "TikTok / YouTube / IG"

User -> Renderer: Click "Run Daily Upload"
Renderer -> Main: invoke('run-daily', profileId)
Main -> Store: getQuota(profileId)
Store --> Main: {date, used}
Main -> Main: remaining = 30 - used
Main -> Store: listFiles(profileId)
Store --> Main: FileMeta[]
Main -> Main: due = pending & scheduledAt<=now
Main -> Renderer: upload-progress {type:'start'}

loop for each due file
  loop for each selected platform
    Main -> Uploader: uploadToPlatform(platform, tokens, path, opts)
    Uploader -> Platform: API call
    Platform --> Uploader: result / error
    Uploader --> Main: {ok, id|error}
    Main -> Renderer: upload-progress {type:'file', pct}
  end
  Main -> Store: setFileMeta(status, results)
end

Main -> Store: incrementQuota(uploaded)
Main --> Renderer: {uploaded, results, quota}
Renderer -> User: Show summary
@enduml
```

## 4. Sequence Diagram — OAuth Authentication

```plantuml
@startuml
actor User
participant Renderer
participant Main as "Main Process"
participant Auth as "auth.js"
participant Browser
participant Platform as "OAuth Provider"
participant Store as "electron-store"

User -> Renderer: Connect Platform
Renderer -> Main: invoke('auth-platform', {profileId, platform})
Main -> Auth: authenticate(platform, win)
Auth -> Auth: startServer(:18923)
Auth -> Browser: openExternal(authUrl)
Browser -> Platform: authorize
Platform -> Browser: redirect localhost:18923/callback?code&state
Browser -> Auth: callback
Auth -> Auth: verify state
Auth -> Platform: exchange code for tokens
Platform --> Auth: tokens
Auth --> Main: tokens
Main -> Store: profile.auth[platform] = tokens
Main --> Renderer: updated auth
Renderer -> User: "Authenticated"
@enduml
```

## 5. Component Diagram

```plantuml
@startuml
package "Renderer Layer" {
  [index.html]
  [renderer.js]
  [styles.css]
}

package "Bridge" {
  [preload.js / contextBridge]
}

package "Main Layer" {
  [main.js]
  [auth.js]
  [uploader.js]
}

database "electron-store" as DB

[renderer.js] --> [preload.js / contextBridge] : window.api
[preload.js / contextBridge] --> [main.js] : IPC
[main.js] --> [auth.js]
[main.js] --> [uploader.js]
[main.js] --> DB : profiles / quota / settings
[auth.js] --> [TikTok OAuth]
[auth.js] --> [YouTube OAuth]
[auth.js] --> [Instagram OAuth]
[uploader.js] --> [TikTok API]
[uploader.js] --> [YouTube API]
[uploader.js] --> [Instagram Graph API]
@enduml
```

## 6. State Diagram — File Lifecycle

```plantuml
@startuml
[*] --> pending
pending --> uploading : run-daily picks file
uploading --> uploaded : all platforms OK
uploading --> failed : any platform error
failed --> pending : user clicks Re-upload
uploaded --> pending : (manual reset)
pending --> [*] : delete file
uploaded --> [*] : delete file
@enduml
```
