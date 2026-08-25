//! Dual-tree pair traversal. Shared verdicts keep forces symmetric.

use super::{FmmTree, NONE};

impl FmmTree {
    const M2L_MIN_RATIO: f64 = 6.0;

    fn m2l_acceptable(&self, a: usize, b: usize) -> bool {
        let na = &self.nodes[a];
        let nb = &self.nodes[b];
        let dx = na.cx - nb.cx;
        let dy = na.cy - nb.cy;
        let d = (dx * dx + dy * dy).sqrt();
        d >= Self::M2L_MIN_RATIO * na.half.max(nb.half)
    }

    pub(super) fn classify_interactions(
        &self,
    ) -> (Vec<Vec<usize>>, Vec<Vec<u32>>) {
        let n = self.nodes.len();
        let mut m2l_lists: Vec<Vec<usize>> = vec![Vec::new(); n];
        let mut near_lists: Vec<Vec<u32>> = vec![Vec::new(); n];

        let mut stack: Vec<(usize, usize)> = vec![(0, 0)];
        while let Some((a, b)) = stack.pop() {
            if a == b {
                let kids = self.nodes[a].children;
                if kids == [NONE; 4] {
                    near_lists[a].push(a as u32);
                    continue;
                }
                for i in 0..4 {
                    if kids[i] == NONE {
                        continue;
                    }
                    for j in i..4 {
                        if kids[j] == NONE {
                            continue;
                        }
                        stack.push((kids[i] as usize, kids[j] as usize));
                    }
                }
                continue;
            }

            if self.m2l_acceptable(a, b) {
                m2l_lists[a].push(b);
                m2l_lists[b].push(a);
                continue;
            }

            let (na, nb) = (&self.nodes[a], &self.nodes[b]);
            match (na.leaf, nb.leaf) {
                (true, true) => {
                    near_lists[a].push(b as u32);
                    near_lists[b].push(a as u32);
                }
                (true, false) => {
                    for &c in &nb.children {
                        if c != NONE {
                            stack.push((a, c as usize));
                        }
                    }
                }
                (false, true) => {
                    for &c in &na.children {
                        if c != NONE {
                            stack.push((c as usize, b));
                        }
                    }
                }
                (false, false) => {
                    // Descend the coarser box so both sides refine together.
                    let (down, keep) = if na.half >= nb.half { (na, b) } else { (nb, a) };
                    for &c in &down.children {
                        if c != NONE {
                            stack.push((c as usize, keep));
                        }
                    }
                }
            }
        }

        for list in m2l_lists.iter_mut() {
            list.sort_unstable();
            list.dedup();
        }
        for list in near_lists.iter_mut() {
            list.sort_unstable();
            list.dedup();
        }
        (m2l_lists, near_lists)
    }
}
