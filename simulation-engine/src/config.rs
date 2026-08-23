pub const WORLD_HALF: f32 = 1.0;
pub const MAX_PARTICLES: usize = 100_000;
pub const TOTAL_MASS: f32 = 1000.0;

pub struct Config {
    pub g: f32,
    pub softening: f32,
    pub order: usize,
    pub leaf_capacity: usize,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            g: 1.0,
            softening: 0.02,
            order: 8,
            leaf_capacity: 32,
        }
    }
}

impl Config {
    pub fn clamp_order(&mut self) {
        self.order = self.order.clamp(2, 24);
        self.leaf_capacity = self.leaf_capacity.clamp(8, 256);
        self.softening = self.softening.max(1e-4);
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Distribution {
    UniformDisc,
    Plummer,
    Spiral,
    TwoClusters,
    Ring,
    Collision,
}

pub const DISTRIBUTION_UNIFORM_DISC: &str = "uniformDisc";
pub const DISTRIBUTION_PLUMMER: &str = "plummer";
pub const DISTRIBUTION_SPIRAL: &str = "spiral";
pub const DISTRIBUTION_TWO_CLUSTERS: &str = "twoClusters";
pub const DISTRIBUTION_RING: &str = "ring";
pub const DISTRIBUTION_COLLISION: &str = "collision";

pub fn parse_distribution(raw: &str) -> Option<Distribution> {
    match raw {
        DISTRIBUTION_UNIFORM_DISC => Some(Distribution::UniformDisc),
        DISTRIBUTION_PLUMMER => Some(Distribution::Plummer),
        DISTRIBUTION_SPIRAL => Some(Distribution::Spiral),
        DISTRIBUTION_TWO_CLUSTERS => Some(Distribution::TwoClusters),
        DISTRIBUTION_RING => Some(Distribution::Ring),
        DISTRIBUTION_COLLISION => Some(Distribution::Collision),
        _ => None,
    }
}
