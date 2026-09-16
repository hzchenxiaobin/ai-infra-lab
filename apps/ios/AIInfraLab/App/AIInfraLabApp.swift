import SwiftUI

@main
struct AIInfraLabApp: App {
    @State private var services = Services.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(services.session)
                .environment(services.links)
                .preferredColorScheme(.dark)
                .tint(Color.accent600)
                .task {
                    await services.session.bootstrap()
                }
        }
    }
}
