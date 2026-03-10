import Foundation

/// Spring-mass-damper physics for smooth animations
public struct SpringSimulator {
    public var stiffness: Double
    public var damping: Double
    public var mass: Double

    public var position: Double
    public var velocity: Double
    public var target: Double

    public init(
        stiffness: Double = 200,
        damping: Double = 20,
        mass: Double = 1,
        position: Double = 0,
        target: Double = 0
    ) {
        self.stiffness = stiffness
        self.damping = damping
        self.mass = mass
        self.position = position
        self.velocity = 0
        self.target = target
    }

    /// Advance the spring simulation by `dt` seconds
    public mutating func step(dt: Double) {
        let displacement = position - target
        let springForce = -stiffness * displacement
        let dampingForce = -damping * velocity
        let acceleration = (springForce + dampingForce) / mass
        velocity += acceleration * dt
        position += velocity * dt
    }

    /// Whether the spring has settled (close enough to target with negligible velocity)
    public var isSettled: Bool {
        abs(position - target) < 0.001 && abs(velocity) < 0.001
    }
}
