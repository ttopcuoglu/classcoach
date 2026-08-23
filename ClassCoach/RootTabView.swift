import SwiftUI

struct RootTabView: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "house.fill")
                }

            TryItOutView()
                .tabItem {
                    Label("Try It Out", systemImage: "figure.2.arms.open")
                }

            AskExpertView()
                .tabItem {
                    Label("Ask an Expert", systemImage: "bubble.left.and.bubble.right.fill")
                }

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.crop.circle")
                }
        }
        .tint(AppTheme.primary)
    }
}

#Preview {
    RootTabView()
}
