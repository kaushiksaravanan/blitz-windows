import Testing
@testable import BlitzCore

@Test func testSpringSettles() {
    var spring = SpringSimulator(stiffness: 200, damping: 20, position: 0, target: 1.0)

    // Simulate for 1 second at 60fps
    for _ in 0..<60 {
        spring.step(dt: 1.0 / 60.0)
    }

    #expect(spring.isSettled)
    #expect(abs(spring.position - 1.0) < 0.01)
}

@Test func testSpringOscillatesWithLowDamping() {
    var spring = SpringSimulator(stiffness: 200, damping: 2, position: 0, target: 1.0)

    // Should overshoot with low damping
    var maxPosition: Double = 0
    for _ in 0..<120 {
        spring.step(dt: 1.0 / 60.0)
        maxPosition = max(maxPosition, spring.position)
    }

    #expect(maxPosition > 1.0) // Should overshoot
}
