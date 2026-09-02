import SwiftUI

/// A rounded speech-bubble outline with a small tail — used for the
/// Welcome screen's two-bubble illustration. Not a precise trace of any
/// specific artwork, just a simple shape in brand colors.
struct ChatBubbleShape: Shape {
    var cornerRadius: CGFloat = 22
    var tailSize: CGFloat = 12

    func path(in rect: CGRect) -> Path {
        let bubbleRect = CGRect(x: rect.minX, y: rect.minY, width: rect.width, height: rect.height - tailSize)
        var path = Path(roundedRect: bubbleRect, cornerRadius: cornerRadius)

        let tailStartX = rect.minX + cornerRadius + 6
        var tail = Path()
        tail.move(to: CGPoint(x: tailStartX, y: bubbleRect.maxY))
        tail.addLine(to: CGPoint(x: tailStartX + tailSize, y: bubbleRect.maxY))
        tail.addLine(to: CGPoint(x: tailStartX, y: rect.maxY))
        tail.closeSubpath()

        path.addPath(tail)
        return path
    }
}

struct AuthIllustration: View {
    var body: some View {
        ZStack {
            ChatBubbleShape()
                .fill(AppTheme.primary)
                .frame(width: 100, height: 78)
                .offset(x: -26, y: -12)
            ChatBubbleShape()
                .fill(AppTheme.accent)
                .frame(width: 100, height: 78)
                .offset(x: 26, y: 16)
        }
        .frame(height: 120)
    }
}

#Preview {
    AuthIllustration()
}
