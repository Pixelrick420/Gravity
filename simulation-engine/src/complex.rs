//! Minimal complex arithmetic for the multipole expansions. f64 only.

#[derive(Clone, Copy, Default, PartialEq, Debug)]
pub(crate) struct Complex {
    pub(crate) re: f64,
    pub(crate) im: f64,
}

impl Complex {
    pub(crate) fn new(re: f64, im: f64) -> Self {
        Self { re, im }
    }

    pub(crate) fn add(self, o: Self) -> Self {
        Self::new(self.re + o.re, self.im + o.im)
    }

    pub(crate) fn mul(self, o: Self) -> Self {
        Self::new(
            self.re * o.re - self.im * o.im,
            self.re * o.im + self.im * o.re,
        )
    }

    pub(crate) fn scale(self, s: f64) -> Self {
        Self::new(self.re * s, self.im * s)
    }

    pub(crate) fn inverse(self) -> Self {
        let norm = self.re * self.re + self.im * self.im;
        debug_assert!(norm > 0.0);
        Self::new(self.re / norm, -self.im / norm)
    }
}
